const express = require("express");
const AuthController = require("../Controller/AuthController");
const suggestionController = require("../Controller/suggestionController");

const router = express.Router({ mergeParams: true });

router.use(AuthController.protectedRoute);

router.get("/", suggestionController.getSuggestions);

router.patch("/toggle-suggestion", suggestionController.toggleCanBeSuggested);

module.exports = router;
