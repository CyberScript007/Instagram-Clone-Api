const express = require("express");
const AuthController = require("../Controller/AuthController");
const NotificationController = require("../Controller/NotificationController");

const router = express.Router();

router.use(AuthController.protectedRoute);

// get all notifications
router.get("/", NotificationController.getAllNotifications);

// get a single notification
router.get("/:id", NotificationController.getNotification);

// mark a notification as read
router.patch("/mark-as-read", NotificationController.markNotificationAsRead);

// delete notification
router.delete("/:id", NotificationController.deleteNotification);

module.exports = router;
