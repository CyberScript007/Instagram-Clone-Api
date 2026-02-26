const express = require("express");
const AuthController = require("../../../Controller/AuthController");
const PostCollectionController = require("../../../Controller/Post/PostCollection/PostCollectionController");

const router = express.Router({ mergeParams: true });

router.use(AuthController.protectedRoute);

router
  .route("/collection/:collectionId")
  .get(PostCollectionController.getSinglePostSaved)
  .post(PostCollectionController.addPostToCustomCollection)
  .delete(PostCollectionController.removePostFromCustomCollection);

router.get(
  "/default-collection",
  PostCollectionController.getDefaultUserCollection
);
router.get(
  "/custom-collection",
  PostCollectionController.getAllUserCustomCollection
);

router.post("/", PostCollectionController.createCustomCollection);

router
  .route("/:collectionId")
  .get(PostCollectionController.getAllPostSavedInCustomCollection)
  .patch(PostCollectionController.RenameCustomCollection)
  .delete(PostCollectionController.deleteCustomCollection);

module.exports = router;
