const express = require("express");
const AuthController = require("../Controller/AuthController");
const AdminController = require("../Controller/AdminController");

const router = express.Router();

router.post(
  "/",
  AuthController.protectedRoute,
  AuthController.restrictTo("admin", "moderator"),
  AdminController.createAdmin
);

module.exports = router;
