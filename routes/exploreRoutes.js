const express = require("express");
const AuthController = require("../Controller/AuthController");
const ExploreController = require("../Controller/ExploreController");

const router = express.Router();

router.get(
  "/",
  AuthController.protectedRoute,
  ExploreController.getExploreFeed
);

module.exports = router;
