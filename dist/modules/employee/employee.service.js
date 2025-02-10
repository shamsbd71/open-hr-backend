"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.employeeService = void 0;
const variables_1 = __importDefault(require("../../config/variables"));
const roles_1 = require("../../enums/roles");
const ApiError_1 = __importDefault(require("../../errors/ApiError"));
const IdGenerator_1 = require("../../lib/IdGenerator");
const jwtTokenHelper_1 = require("../../lib/jwtTokenHelper");
const leaveHelper_1 = require("../../lib/leaveHelper");
const mailSender_1 = require("../../lib/mailSender");
const paginationHelper_1 = require("../../lib/paginationHelper");
const bcrypt_1 = __importDefault(require("bcrypt"));
const http_status_1 = __importDefault(require("http-status"));
const mongoose_1 = __importDefault(require("mongoose"));
const employee_job_model_1 = require("../employee-job/employee-job.model");
const employee_onboarding_model_1 = require("../employee-onboarding/employee-onboarding.model");
const leave_model_1 = require("../leave/leave.model");
const payroll_model_1 = require("../payroll/payroll.model");
const setting_service_1 = require("../setting/setting.service");
const employee_model_1 = require("./employee.model");
// get all employees
const getAllEmployeeService = (paginationOptions, filterOptions) => __awaiter(void 0, void 0, void 0, function* () {
    const { limit, skip, sortBy, sortOrder } = paginationHelper_1.paginationHelpers.calculatePagination(paginationOptions);
    // Extract search and filter options
    const { search, status } = filterOptions;
    // Create a text search stage for multiple fields
    let matchStage = {
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
    let pipeline = [matchStage];
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
    const result = yield employee_model_1.Employee.aggregate(pipeline);
    const total = yield employee_model_1.Employee.countDocuments(matchStage.$match);
    return {
        result: result,
        meta: {
            total: total,
        },
    };
});
// get admin and mods
const getAdminAndModsService = () => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield employee_model_1.Employee.find({
        role: { $in: [roles_1.ENUM_ROLE.ADMIN, roles_1.ENUM_ROLE.MODERATOR] },
    });
    return result;
});
// get all employees id
const getAllEmployeeBasicsService = () => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield employee_model_1.Employee.aggregate([
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
});
// get single employee
const getSingleEmployeeService = (id) => __awaiter(void 0, void 0, void 0, function* () {
    const employee = yield employee_model_1.Employee.findOne({ id: id });
    return employee;
});
// get single employee by invite token
const getSingleEmployeeByInviteTokenService = (inviteToken) => __awaiter(void 0, void 0, void 0, function* () {
    const decodedToken = jwtTokenHelper_1.jwtHelpers.verifyToken(inviteToken, variables_1.default.jwt_secret);
    const userId = decodedToken.id;
    const employee = yield employee_model_1.Employee.findOne({ id: userId });
    return employee;
});
// insert employee
const createEmployeeService = (employeeData) => __awaiter(void 0, void 0, void 0, function* () {
    const session = yield mongoose_1.default.startSession();
    session.startTransaction();
    try {
        // count data by department
        const departmentSerial = (yield employee_job_model_1.EmployeeJob.countDocuments({
            department: employeeData.department,
        })) + 1;
        const joiningDate = new Date(employeeData.joining_date);
        const employeeId = (0, IdGenerator_1.generateEmployeeId)(employeeData.department, joiningDate, departmentSerial);
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
        const leaveAllottedDays = yield setting_service_1.settingService.getLeaveAllottedDays();
        const createEmployeeLeaveData = {
            employee_id: employeeId,
            years: [
                {
                    year: joiningDate.getFullYear(),
                    casual: {
                        allotted: (0, leaveHelper_1.calculateRemainingLeave)(joiningDate, leaveAllottedDays.casual),
                        consumed: 0,
                    },
                    sick: {
                        allotted: (0, leaveHelper_1.calculateRemainingLeave)(joiningDate, leaveAllottedDays.sick),
                        consumed: 0,
                    },
                    earned: {
                        allotted: 0,
                        consumed: 0,
                    },
                    without_pay: {
                        allotted: (0, leaveHelper_1.calculateRemainingLeave)(joiningDate, leaveAllottedDays.without_pay),
                        consumed: 0,
                    },
                },
            ],
        };
        // onboarding data
        const onboardingTasks = yield setting_service_1.settingService.getOnboardingTasksService();
        const createEmployeeOnboardingData = {
            employee_id: employeeId,
            tasks: onboardingTasks.map((task) => ({
                task_name: task.name,
                assigned_to: task.assigned_to,
                status: "pending",
            })),
        };
        // insert employee
        const newEmployeeData = new employee_model_1.Employee(createEmployeeData);
        const insertedEmployee = yield newEmployeeData.save({ session });
        // insert employee job
        const newEmployeeJobData = new employee_job_model_1.EmployeeJob(createEmployeeJobData);
        yield newEmployeeJobData.save({ session });
        // insert employee payroll
        const newPayrollData = new payroll_model_1.Payroll(createPayrollData);
        yield newPayrollData.save({ session });
        // insert employee leave
        const newEmployeeLeaveData = new leave_model_1.Leave(createEmployeeLeaveData);
        yield newEmployeeLeaveData.save({ session });
        // insert employee onboarding
        const newEmployeeOnboardingData = new employee_onboarding_model_1.EmployeeOnboarding(createEmployeeOnboardingData);
        yield newEmployeeOnboardingData.save({ session });
        const invite_token = jwtTokenHelper_1.jwtHelpers.createToken({ id: employeeId, role: "user" }, variables_1.default.jwt_secret, variables_1.default.jwt_expire);
        yield mailSender_1.mailSender.invitationRequest(employeeData.personal_email, employeeData.designation, invite_token, joiningDate);
        yield session.commitTransaction();
        session.endSession();
        return insertedEmployee;
    }
    catch (error) {
        yield session.abortTransaction();
        session.endSession();
        throw error;
    }
});
// update
const updateEmployeeService = (updatedData, id) => __awaiter(void 0, void 0, void 0, function* () {
    // const employee = await Employee.findOne({ id });
    // if (
    //   employee?.image !== updatedData.image &&
    //   employee?.image &&
    //   !employee.image.startsWith("http")
    // ) {
    //   await deleteFile(employee?.image);
    // }
    const result = yield employee_model_1.Employee.findOneAndUpdate({ id: id }, {
        $set: updatedData,
    }, {
        new: true,
    });
    return result;
});
// update employee work email
const updateEmployeeEmailService = (work_email, id) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield employee_model_1.Employee.findOneAndUpdate({ id: id }, { work_email }, {
        new: true,
    });
    return result;
});
// update employee password
const updateEmployeePasswordService = (password, id) => __awaiter(void 0, void 0, void 0, function* () {
    const hashedPassword = yield bcrypt_1.default.hash(password, variables_1.default.salt);
    const result = yield employee_model_1.Employee.findOneAndUpdate({ id: id }, { password: hashedPassword }, {
        new: true,
    });
    return result;
});
// update employee discord
const updateEmployeeDiscordService = (discord, id) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield employee_model_1.Employee.findOneAndUpdate({ id: id }, { discord }, {
        new: true,
    });
    return result;
});
// update employee personality
const updateEmployeePersonalityService = (personality, id) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield employee_model_1.Employee.findOneAndUpdate({ id: id }, { personality }, {
        new: true,
    });
    return result;
});
// update employee role
const updateEmployeeRoleService = (id, role) => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield employee_model_1.Employee.findOneAndUpdate({ id: id }, { role }, {
        new: true,
    });
    return result;
});
// delete employee
const deleteEmployeeService = (id) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const deleteEmployee = yield employee_model_1.Employee.findOneAndDelete({ id: id }, { new: true });
        if (!deleteEmployee) {
            throw new ApiError_1.default("employee is not delete", http_status_1.default.FORBIDDEN);
        }
    }
    catch (error) {
        throw new ApiError_1.default("employee is not delete", http_status_1.default.FORBIDDEN);
    }
});
exports.employeeService = {
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
//# sourceMappingURL=employee.service.js.map