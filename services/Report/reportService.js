const { tryCatch } = require("bullmq");
const ReportModel = require("../../Models/Report/ReportModel");
const catchAsync = require("../../Utils/catchAsync");

exports.createReport = async ({
  reporter,
  reportedContent,
  contentType,
  reason,
  description,
  reportedUser,
}) => {
  try {
    // Create a new report document
    const newReport = await ReportModel.create({
      reporter,
      reportedContent,
      contentType,
      reason,
      description,
      reportedUser,
    });

    return newReport;
  } catch (err) {
    console.error("Error creating report: ", err.message);
    throw err;
  }
};
