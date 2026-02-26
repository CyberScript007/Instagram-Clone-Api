const express = require("express");

const AuthController = require("../../Controller/AuthController");
const ReelsAudioController = require("../../Controller/Audio/ReelsAudioController");

const savedAudioRoutes = require("../Audio/savedAudioRoutes");

const router = express.Router({ mergeParams: true });

router.use("/", savedAudioRoutes);

router.use(AuthController.protectedRoute);

router.get("/:audioId/posts", ReelsAudioController.getAllPostsAudio);

router.get("/:audioId/post", ReelsAudioController.getSinglePostAudio);

module.exports = router;
