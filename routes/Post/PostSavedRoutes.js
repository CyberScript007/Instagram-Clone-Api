const express = require("express");

const AuthController = require("../../Controller/AuthController");
const PostSavedController = require("../../Controller/Post/PostSavedController");

const router = express.Router({ mergeParams: true });

router.use(AuthController.protectedRoute);

router.get("/saves", PostSavedController.getAllSavePost);

router
  .route("/save")
  .get(PostSavedController.getSingleSavedPost)
  .post(PostSavedController.toggleSavedPost);

module.exports = router;
