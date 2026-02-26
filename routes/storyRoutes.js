const express = require("express");
const AuthController = require("../Controller/AuthController");
const StoryController = require("../Controller/StoryController");

const uploadPostAndStoriesMiddleware = require("../Utils/uploadPostsAndStoriesMiddleware");

const router = express.Router();

// Protect all routes after this middleware
router.use(AuthController.protectedRoute);

router.post(
  "/",
  uploadPostAndStoriesMiddleware("story").array("media", 10),
  StoryController.resizeImageAndVideoStory,
  StoryController.createStories,
);

router.get("/", StoryController.getFollowedStories);

module.exports = router;
