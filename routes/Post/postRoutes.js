const express = require("express");
const AuthController = require("../../Controller/AuthController");
const PostController = require("../../Controller/Post/PostController");
const uploadPostsAndStoriesMiddleware = require("../../Utils/uploadPostsAndStoriesMiddleware");
const PostCommentRoutes = require("../Post/PostComment/postCommentRoutes");
const PostLikeRoutes = require("./postLikeRoutes");
const PostSavedRoutes = require("./PostSavedRoutes");
const PostCollectionRoutes = require("./PostCollection/postCollectionRoutes");
const PostTaggedUserRoutes = require("./PostTaggedUser/PostTaggedUserRoutes");
const router = express.Router();

// Nested post route
// i created this middleware to be able to create comments or likes url like this /api/posts/postId/comments or /like
router.use("/tagged", PostTaggedUserRoutes);
router.use("/:postId/tagged", PostTaggedUserRoutes);

router.use(
  "/:postId",
  PostCommentRoutes,
  PostLikeRoutes,
  PostSavedRoutes,
  PostCollectionRoutes,
);

router.use("/", PostSavedRoutes);

// the user must login before access any of the post routes
router.use(AuthController.protectedRoute);

router
  .route("/")
  .get(PostController.preselectPostField, PostController.getAllPosts)
  .post(
    AuthController.restrictTo("user", "admin"),
    uploadPostsAndStoriesMiddleware("post").array("media", 10),
    PostController.resizeCompressedImagesOrVideos,
    PostController.createPost,
  );

router
  .route("/:postId")
  .get(PostController.getPost)
  .patch(AuthController.restrictTo("user", "admin"), PostController.updatePosts)
  .delete(
    AuthController.restrictTo("user", "admin"),
    PostController.deletePosts,
  );

module.exports = router;
