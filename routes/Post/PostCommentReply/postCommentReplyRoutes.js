const express = require("express");
const AuthController = require("../../../Controller/AuthController");
const PostCommentReplyController = require("../../../Controller/Post/PostCommentReply/PostCommentReplyController");

const router = express.Router({ mergeParams: true });

router.use(AuthController.protectedRoute);

router
  .route("/reply")
  .get(PostCommentReplyController.getAllPostCommentReply)
  .post(PostCommentReplyController.createCommentReply)
  .delete(PostCommentReplyController.deletePostCommentReply);

module.exports = router;
