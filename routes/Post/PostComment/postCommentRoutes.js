const express = require("express");
const AuthController = require("../../../Controller/AuthController");
const PostCommentController = require("../../../Controller/Post/PostComment/PostCommentController");
const PostCommentLikeRoutes = require("./postCommentLikeRoutes");
const PostCommentReplyRoutes = require("../PostCommentReply/postCommentReplyRoutes");
const postCommentReplyLikeRoutes = require("../PostCommentReply/postCommentReplyLikeRoutes");

const router = express.Router({ mergeParams: true });

// Nested comment routes
// i created this middleware to be able to create comments or likes url like this /api/comment/commentId/like
router.use("/:commentId", PostCommentLikeRoutes, PostCommentReplyRoutes);

// Nested reply routes
router.use("/:commentReplyId", postCommentReplyLikeRoutes);

// Nested reply routes
// It is only  use to delete the post comment reply
router.use("/commentReply/:commentReplyId", PostCommentReplyRoutes);

router.use(AuthController.protectedRoute);

router
  .route("/comments")
  .get(PostCommentController.getAllPostComments)
  .post(PostCommentController.createComment);

router.route("/:commentId").delete(PostCommentController.deletePostComment);

module.exports = router;
