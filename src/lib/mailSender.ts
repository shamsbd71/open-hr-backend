import config from "@/config/variables";
import nodemailer from "nodemailer";
import {
  invitationTemplate,
  leaveRequestApprovedTemplate,
  leaveRequestRejectedTemplate,
  leaveRequestTemplate,
  offboardingTemplate,
} from "./mailTemplate";

let mailTransporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: config.sender_email,
    pass: config.sender_password,
  },
});

// invitation
const invitationRequest = async (
  email: string,
  designation: string,
  invite_token: string,
  joining_date: Date
) => {
  let mailDetails = {
    from: config.sender_email,
    to: email,
    subject: "Invitation from Themefisher",
    html: await invitationTemplate(designation, joining_date, invite_token),
  };
  await mailTransporter.sendMail(mailDetails);
};

// offboarding
const offboardingInitiate = async (
  email: string,
  name: string,
  resignation_date: Date
) => {
  let mailDetails = {
    from: config.sender_email,
    to: email,
    subject: "Invitation from Themefisher",
    html: await offboardingTemplate(name, resignation_date),
  };
  await mailTransporter.sendMail(mailDetails);
};

// leave request
const leaveRequest = async (
  emails: string[],
  name: string,
  leaveType: string,
  dayCount: number,
  startDate: Date,
  endDate: Date,
  reason: string
) => {
  let mailDetails = {
    from: config.sender_email,
    to: emails,
    subject: `Leave Request by ${name}`,
    html: await leaveRequestTemplate(
      name,
      leaveType,
      dayCount,
      startDate,
      endDate,
      reason
    ),
  };
  await mailTransporter.sendMail(mailDetails);
};

// leave request response
const leaveRequestResponse = async (
  email: string,
  name: string,
  leaveType: string,
  dayCount: number,
  startDate: Date,
  endDate: Date,
  reason: string,
  status: string
) => {
  let mailDetails = {
    from: config.sender_email,
    to: email,
    subject: `Leave Request ${status}`,
    html:
      status === "approved"
        ? await leaveRequestApprovedTemplate(
            name,
            leaveType,
            dayCount,
            startDate,
            endDate,
            reason
          )
        : await leaveRequestRejectedTemplate(
            name,
            leaveType,
            dayCount,
            startDate,
            endDate,
            reason
          ),
  };
  await mailTransporter.sendMail(mailDetails);
};

export const mailSender = {
  invitationRequest,
  offboardingInitiate,
  leaveRequest,
  leaveRequestResponse,
};
