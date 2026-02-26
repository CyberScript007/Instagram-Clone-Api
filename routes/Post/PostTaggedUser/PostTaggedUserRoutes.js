const express = require("express");
const AuthController = require("../../../Controller/AuthController");
const PostTaggedUserController = require("../../../Controller/Post/PostTaggedUser/PostTaggedUserController");

const router = express.Router({ mergeParams: true });

router.use(AuthController.protectedRoute);

router
  .route("/")
  .get(PostTaggedUserController.getAllTaggedPostByUser)
  .post(PostTaggedUserController.createTaggedPost);

router
  .route("/:taggedId")
  .get(PostTaggedUserController.getSingleTaggedPostByUser)
  .patch(PostTaggedUserController.updateTaggedPostByUser)
  .delete(PostTaggedUserController.deleteTaggedPostByUser);

module.exports = router;
