const express = require("express");
const AuthController = require("../../Controller/AuthController");
const SavedAudioController = require("../../Controller/Audio/SavedAudioCollection");

const router = express.Router({ mergeParams: true });

router.use(AuthController.protectedRoute);

router.get("/saves", SavedAudioController.getAllSavedAudio);

router
  .route("/:audioId/save")
  .post(SavedAudioController.toggleSavedAudio)
  .get(SavedAudioController.getSingleSavedAudio);

module.exports = router;
