import { default as config, default as variables } from "@/config/variables";
import { ENUM_ROLE } from "@/enums/roles";
import ApiError from "@/errors/ApiError";
import { generateEmployeeId } from "@/lib/IdGenerator";
import { jwtHelpers } from "@/lib/jwtTokenHelper";
import { calculateRemainingLeave } from "@/lib/leaveHelper";
import { mailSender } from "@/lib/mailSender";
import { paginationHelpers } from "@/lib/paginationHelper";
import { PaginationType } from "@/types";
import bcrypt from "bcrypt";
import httpStatus from "http-status";
import { Secret } from "jsonwebtoken";
import mongoose, { PipelineStage } from "mongoose";
import { EmployeeJob } from "../employee-job/employee-job.model";
import { EmployeeOnboarding } from "../employee-onboarding/employee-onboarding.model";
import { Leave } from "../leave/leave.model";
import { Payroll } from "../payroll/payroll.model";
import { settingService } from "../setting/setting.service";
import { Employee } from "./employee.model";
import {
  EmployeeCreateType,
  EmployeeFilterOptions,
  EmployeeType,
} from "./employee.type";

// get all employees
const getAllEmployeeService = async (
  paginationOptions: Partial<PaginationType>,
  filterOptions: EmployeeFilterOptions
) => {
  const { limit, skip, sortBy, sortOrder } =
    paginationHelpers.calculatePagination(paginationOptions);

  // Extract search and filter options
  const { search, status } = filterOptions;

  // Create a text search stage for multiple fields
  let matchStage: any = {
    $match: {},
  };

  // Search condition
  if (search) {
    const searchKeyword = String(search).replace(/\+/g, " ");
    const keywords = searchKeyword.split("|");
    const searchConditions = keywords.map((keyword) => ({
      $or: [
        { work_email: { $regex: keyword, $options: "i" } },
        { name: { $regex: keyword, $options: "i" } },
      ],
    }));
    matchStage.$match.$or = searchConditions;
  }

  // status condition
  if (status) {
    matchStage.$match.status = status;
  }

  let pipeline: PipelineStage[] = [matchStage];

  // Sorting stage
  pipeline.push({
    $sort: {
      [sortBy]: sortOrder === "asc" ? 1 : -1,
      _id: 1,
    },
  });

  if (skip) {
    pipeline.push({ $skip: skip });
  }
  if (limit) {
    pipeline.push({ $limit: limit });
  }

  pipeline.push({
    $project: {
      _id: 0,
      id: 1,
      name: 1,
      image: 1,
      work_email: 1,
      personal_email: 1,
      role: 1,
      dob: 1,
      nid: 1,
      tin: 1,
      phone: 1,
      gender: 1,
      blood_group: 1,
      marital_status: 1,
      present_address: 1,
      permanent_address: 1,
      facebook: 1,
      twitter: 1,
      linkedin: 1,
      discord: 1,
      personality: 1,
      status: 1,
      note: 1,
      createdAt: 1,
    },
  });

  // Reapply sorting after grouping
  pipeline.push({
    $sort: {
      [sortBy]: sortOrder === "asc" ? 1 : -1,
    },
  });

  // result
  const result = await Employee.aggregate(pipeline);
  const total = await Employee.countDocuments(matchStage.$match);

  return {
    result: result,
    meta: {
      total: total,
    },
  };
};

// get admin and mods
const getAdminAndModsService = async () => {
  const result = await Employee.find({
    role: { $in: [ENUM_ROLE.ADMIN, ENUM_ROLE.MODERATOR] },
  });
  return result;
};

// get all employees id
const getAllEmployeeBasicsService = async () => {
  const result = await Employee.aggregate([
    {
      $lookup: {
        from: "employee_jobs",
        localField: "id",
        foreignField: "employee_id",
        as: "job",
      },
    },
    {
      $project: {
        _id: 0,
        id: 1,
        name: 1,
        work_email: 1,
        department: { $arrayElemAt: ["$job.department", 0] },
        designation: { $arrayElemAt: ["$job.designation", 0] },
      },
    },
  ]);
  return result;
};

// get single employee
const getSingleEmployeeService = async (
  id: string
): Promise<EmployeeType | null> => {
  const employee = await Employee.findOne({ id: id });
  return employee;
};

// get single employee by invite token
const getSingleEmployeeByInviteTokenService = async (
  inviteToken: string
): Promise<EmployeeType | null> => {
  const decodedToken = jwtHelpers.verifyToken(
    inviteToken,
    config.jwt_secret as Secret
  );
  const userId = decodedToken.id;
  const employee = await Employee.findOne({ id: userId });
  return employee;
};

// insert employee
const createEmployeeService = async (employeeData: EmployeeCreateType) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // count data by department
    const departmentSerial =
      (await EmployeeJob.countDocuments({
        department: employeeData.department,
      })) + 1;

    const joiningDate = new Date(employeeData.joining_date);

    const employeeId = generateEmployeeId(
      employeeData.department,
      joiningDate,
      departmentSerial
    );

    // employee data
    const createEmployeeData = {
      id: employeeId,
      personal_email: employeeData.personal_email,
    };

    // job data
    const createEmployeeJobData = {
      employee_id: employeeId,
      department: employeeData.department,
      manager_id: employeeData.manager_id,
      job_type: employeeData.job_type,
      designation: employeeData.designation,
      joining_date: joiningDate,
    };

    // payroll data
    const createPayrollData = {
      employee_id: employeeId,
      gross_salary: employeeData.gross_salary,
      status: "active",
    };

    // leave data
    const leaveAllottedDays = await settingService.getLeaveAllottedDays();
    const createEmployeeLeaveData = {
      employee_id: employeeId,
      years: [
        {
          year: joiningDate.getFullYear(),
          casual: {
            allotted: calculateRemainingLeave(
              joiningDate,
              leaveAllottedDays.casual
            ),
            consumed: 0,
          },
          sick: {
            allotted: calculateRemainingLeave(
              joiningDate,
              leaveAllottedDays.sick
            ),
            consumed: 0,
          },
          earned: {
            allotted: 0,
            consumed: 0,
          },
          without_pay: {
            allotted: calculateRemainingLeave(
              joiningDate,
              leaveAllottedDays.without_pay
            ),
            consumed: 0,
          },
        },
      ],
    };

    // onboarding data
    const onboardingTasks = await settingService.getOnboardingTasksService();
    const createEmployeeOnboardingData = {
      employee_id: employeeId,
      tasks: onboardingTasks.map((task) => ({
        task_name: task.name,
        assigned_to: task.assigned_to,
        status: "pending",
      })),
    };

    // insert employee
    const newEmployeeData = new Employee(createEmployeeData);
    const insertedEmployee = await newEmployeeData.save({ session });

    // insert employee job
    const newEmployeeJobData = new EmployeeJob(createEmployeeJobData);
    await newEmployeeJobData.save({ session });

    // insert employee payroll
    const newPayrollData = new Payroll(createPayrollData);
    await newPayrollData.save({ session });

    // insert employee leave
    const newEmployeeLeaveData = new Leave(createEmployeeLeaveData);
    await newEmployeeLeaveData.save({ session });

    // insert employee onboarding
    const newEmployeeOnboardingData = new EmployeeOnboarding(
      createEmployeeOnboardingData
    );
    await newEmployeeOnboardingData.save({ session });

    const invite_token = jwtHelpers.createToken(
      { id: employeeId, role: "user" },
      config.jwt_secret as Secret,
      config.jwt_expire as string
    );

    await mailSender.invitationRequest(
      employeeData.personal_email,
      employeeData.designation,
      invite_token,
      joiningDate
    );

    await session.commitTransaction();
    session.endSession();

    return insertedEmployee;
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
};

// update
const updateEmployeeService = async (updatedData: EmployeeType, id: string) => {
  // const employee = await Employee.findOne({ id });
  // if (
  //   employee?.image !== updatedData.image &&
  //   employee?.image &&
  //   !employee.image.startsWith("http")
  // ) {
  //   await deleteFile(employee?.image);
  // }

  const result = await Employee.findOneAndUpdate(
    { id: id },
    {
      $set: updatedData,
    },
    {
      new: true,
    }
  );
  return result;
};

// update employee work email
const updateEmployeeEmailService = async (work_email: string, id: string) => {
  const result = await Employee.findOneAndUpdate(
    { id: id },
    { work_email },
    {
      new: true,
    }
  );
  return result;
};

// update employee password
const updateEmployeePasswordService = async (password: string, id: string) => {
  const hashedPassword = await bcrypt.hash(password, variables.salt);

  const result = await Employee.findOneAndUpdate(
    { id: id },
    { password: hashedPassword },
    {
      new: true,
    }
  );
  return result;
};

// update employee discord
const updateEmployeeDiscordService = async (discord: string, id: string) => {
  const result = await Employee.findOneAndUpdate(
    { id: id },
    { discord },
    {
      new: true,
    }
  );
  return result;
};

// update employee personality
const updateEmployeePersonalityService = async (
  personality: string,
  id: string
) => {
  const result = await Employee.findOneAndUpdate(
    { id: id },
    { personality },
    {
      new: true,
    }
  );
  return result;
};

// update employee role
const updateEmployeeRoleService = async (id: string, role: string) => {
  const result = await Employee.findOneAndUpdate(
    { id: id },
    { role },
    {
      new: true,
    }
  );
  return result;
};

// delete employee
const deleteEmployeeService = async (id: string) => {
  try {
    const deleteEmployee = await Employee.findOneAndDelete(
      { id: id },
      { new: true }
    );

    if (!deleteEmployee) {
      throw new ApiError("employee is not delete", httpStatus.FORBIDDEN);
    }
  } catch (error) {
    throw new ApiError("employee is not delete", httpStatus.FORBIDDEN);
  }
};

export const employeeService = {
  getAllEmployeeService,
  getAllEmployeeBasicsService,
  getSingleEmployeeService,
  getSingleEmployeeByInviteTokenService,
  getAdminAndModsService,
  createEmployeeService,
  updateEmployeeService,
  updateEmployeeEmailService,
  updateEmployeePasswordService,
  updateEmployeeDiscordService,
  updateEmployeePersonalityService,
  updateEmployeeRoleService,
  deleteEmployeeService,
};
