const NotificationInstagram = require("../Models/NotificationModel");
const ApiFeatures = require("../Utils/ApiFeatures");
const catchAsync = require("../Utils/catchAsync");
const sendErrorMiddleware = require("../Utils/sendErrorMiddleware");

// get all notification from the database
exports.getAllNotifications = catchAsync(async (req, res, next) => {
  // store the user id into a variable
  const loggedInUser = req.user.id;

  // use ApiFeatures to filter, sort, limit fields and paginate the notifications
  const features = new ApiFeatures(
    req.query,
    NotificationInstagram.find({ receiver: loggedInUser })
  )
    .filter()
    .sort()
    .limitFields()
    .pagination();

  // get all notifications
  const notifications = await features.query
    .populate("sender", "username photo")
    .populate("receiver", "username photo");

  // send all notifications as response
  res.status(200).json({
    status: "success",
    results: notifications.length,
    data: {notifications},
  });
});

// get a single notification
exports.getNotification = catchAsync(async (req, res, next) => {
  // store the logged in user id into a variable
  const loggedInUser = req.user.id;

  // get the notification id from the request params
  const notificationId = req.params.id;

  // get the notification from the database
  const notification = await NotificationInstagram.findOne({
    _id: notificationId,
    receiver: loggedInUser,
  })
    .populate("sender", "username photo")
    .populate("receiver", "username photo")
    .populate("post", "media caption");

  // send error message to global error middleware if the notification does not exist
  if (!notification) {
    return next(
      new sendErrorMiddleware("The notification does not exist", 404)
    );
  }

  // send the response to user
  res.status(200).json({
    status: "success",
    data: {notification},
  });
});

// mark notification as read
exports.markNotificationAsRead = catchAsync(async (req, res, next) => {
  // store the logged in user id into a variable
  const loggedInUser = req.user.id;

  // get all the notification that was sent to the logged in user and update them as read
  const notifications = await NotificationInstagram.updateMany(
    { receiver: loggedInUser, isRead: false },
    { isRead: true }
  );

  // check if any notification was updated
  if (notifications.modifiedCount === 0) {
    return next(
      new sendErrorMiddleware("No unread notifications to mark as read", 404)
    );
  }

  // send the response to user
  res.status(200).json({
    status: "success",
    message: "All notifications marked as read",
    data: {
      count: notifications.modifiedCount,
    },
  });
});

// delete notification
exports.deleteNotification = catchAsync(async (req, res, next) => {
  // store the logged in user id into a variable
  const loggedInUser = req.user.id;

  // get the notification id from the request params
  const notificationId = req.params.id;

  // get the notification from the database
  const notification = await NotificationInstagram.findById(notificationId);

  // send error message to global error middleware if the notification does not exist
  if (!notification) {
    return next(
      new sendErrorMiddleware("The notification does not exist", 404)
    );
  }

  // check if the notification receiver is the logged in user
  if (notification.receiver.toString() !== loggedInUser) {
    return next(
      new sendErrorMiddleware(
        "You are not authorized to delete this notification",
        403
      )
    );
  }

  // delete the notification
  await NotificationInstagram.findByIdAndDelete(notificationId);

  // send the response to user
  res.status(204).json({
    status: "success",
    data: null,
  });
});
