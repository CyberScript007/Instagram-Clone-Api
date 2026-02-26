const NotificationInstagram = require("../Models/NotificationModel");
const publishNotification = require("../Utils/publishNotification");

const notificationJob = async (job) => {
  try {
    // destructure the job.data
    const {
      receiver,
      sender,
      post,
      message,
      type,
      typeMention,
      commentText,
      postCaption,
    } = job.data;

    // to make sure the user doesn't send it self a notification
    if (receiver === sender) {
      console.log("User cannot send notification to yourself");
      return;
    }

    const filterObj = {
      receiver,
      sender,
      post,
      message,
      type,
    };

    if (filterObj.type === "mention") {
      filterObj.typeMention = typeMention;

      if (typeMention === "post") {
        filterObj.postCaption = postCaption;
      }

      if (typeMention === "comment") {
        filterObj.commentText = commentText;
      }
    }

    if (filterObj.type === "comment") {
      filterObj.commentText = commentText;
    }

    // saved the notification into database
    const newNotification = await NotificationInstagram.create(filterObj);
    console.log(newNotification);

    // use the new notification id to select the notification and populate the receiver, sender and post
    const notification = await NotificationInstagram.findById(
      newNotification._id
    )
      .sort({ createdAt: -1 })
      .populate("sender", "username photo")
      .populate("receiver", "username photo")
      .populate("post", "media caption");

    // Publish notification
    await publishNotification("notification", notification);
  } catch (err) {
    console.log("notification job error", err);
    throw err;
  }
};

module.exports = notificationJob;
