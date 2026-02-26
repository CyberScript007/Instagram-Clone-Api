const express = require("express");
const AuthController = require("../../../Controller/AuthController");
const PostCommentReplyLikeController = require("../../../Controller/Post/PostCommentReply/PostCommentReplyLikeController");

const router = express.Router({ mergeParams: true });

router.use(AuthController.protectedRoute);

router
  .route("/reply/like")
  .get(PostCommentReplyLikeController.getAllCommentReplyLike)
  .post(PostCommentReplyLikeController.toggleCommentReplyLike);

module.exports = router;
