const express = require("express");

const AuthController = require("../Controller/AuthController");
const ReelsController = require("../Controller/ReelsController");

const router = express.Router();

router.use(AuthController.protectedRoute);

router.get("/", ReelsController.getAllReels);

module.exports = router;
