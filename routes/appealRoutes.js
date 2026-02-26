const AuthController = require("../Controller/AuthController");
const AppealController = require("../Controller/AppealController");

const express = require("express");

const appealRouter = express.Router();

appealRouter.post(
  "/submit-content",
  AuthController.protectedRoute,
  AppealController.submitContentAppeal
);

appealRouter.post("/submit-account", AppealController.submitAccountAppeal);

appealRouter.use(AuthController.protectedRoute);
appealRouter.use(AuthController.restrictTo("admin", "moderator"));

appealRouter.post("/:id/action", AppealController.takenActionOnAppeal);

appealRouter.get("/", AppealController.getAllAppealReports);

appealRouter
  .route("/:id")
  .get(AppealController.getSingleAppealReport)
  .delete(AppealController.deleteAppealReport);

module.exports = appealRouter;
