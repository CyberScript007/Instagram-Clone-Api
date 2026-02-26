const express = require("express");
const AuthController = require("../../Controller/AuthController");
const ReportController = require("../../Controller/Report/ReportController");

const reportRouter = express.Router();

reportRouter.use(AuthController.protectedRoute);

reportRouter.post(
  "/create-report",
  ReportController.rateLimitReport,
  ReportController.createReportLogic
);

reportRouter.use(AuthController.restrictTo("admin", "moderator"));

reportRouter.get("/", ReportController.getAllReports);

reportRouter.post("/:id/action", ReportController.takeActionOnReport);

reportRouter
  .route("/:id")
  .get(ReportController.getSingleReport)
  .delete(ReportController.deleteReport);

module.exports = reportRouter;
