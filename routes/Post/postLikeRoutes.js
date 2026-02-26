const express = require("express");
const AuthController = require("../../Controller/AuthController");
const PostLikeAndUnlikeController = require("../../Controller/Post/PostLikeAndUnlikeController");

const router = express.Router({ mergeParams: true });
// console.log(router.);

router.use(AuthController.protectedRoute);

router.post("/like", PostLikeAndUnlikeController.toggleLikePost);

router.get("/like/count", PostLikeAndUnlikeController.getAllPostLike);

module.exports = router;
