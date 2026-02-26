const mongoose = require("mongoose");

const NotificationSchema = new mongoose.Schema(
  {
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Receiver is required"],
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Sender is required"],
    },
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
    },
    type: {
      type: String,
      enum: {
        values: [
          "like",
          "comment",
          "tag",
          "follow",
          "mention",
          "follow_request",
        ],
        message:
          "The type should only consist of like, comment, tag, follow, mention and follow_request",
      },
      required: [true, "Type field is required"],
    },
    message: String,
    isRead: {
      type: Boolean,
      default: false,
    },
    typeMention: {
      type: String,
      enum: {
        values: ["post", "comment"],
        message: "typeMention should only consist of post or comment",
      },
    },
    commentText: String,
    postCaption: String,
  },
  {
    timestamps: true,
  }
);

const NotificationInstagram = mongoose.model(
  "NotificationInstagram",
  NotificationSchema
);

module.exports = NotificationInstagram;
