const express = require("express");
const AuthController = require("../../../Controller/AuthController");
const PostCommentLikeController = require("../../../Controller/Post/PostComment/PostCommentLikeController");

const router = express.Router({ mergeParams: true });

router
  .route("/like")
  .get(
    AuthController.protectedRoute,
    PostCommentLikeController.getAllCommentLikes
  )
  .post(
    AuthController.protectedRoute,
    PostCommentLikeController.toggleLikeComment
  );

module.exports = router;
