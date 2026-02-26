const express = require("express");
const FollowController = require("../Controller/FollowController");
const AuthController = require("../Controller/AuthController");

const router = express.Router({ mergeParams: true });

router.use(AuthController.protectedRoute);

router.post("/follow", FollowController.toggleFollow);

router.get(
  "/followers",
  AuthController.restrictTo("user", "admin"),
  FollowController.getUserFollowers
);

router.get("/following", FollowController.getUserFollowing);

router.patch(
  "/:followRequestId/follow-request",
  FollowController.acceptAndRejectRequest
);

router.patch("/privacy", FollowController.toggleAccount);

module.exports = router;
