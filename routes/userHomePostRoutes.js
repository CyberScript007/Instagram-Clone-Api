const express = require("express");
const AuthController = require("../Controller/AuthController");
const UserHomePostController = require("../Controller/UserHomePostController");

const router = express.Router();

router.use(AuthController.protectedRoute);

// get user home posts
router.get("/home", UserHomePostController.getUserHomePosts);

module.exports = router;
