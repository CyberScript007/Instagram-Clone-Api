const mongoose = require("mongoose");

const appealSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "An appeal must belong to a user"],
      index: true,
    },
    contentType: {
      type: String,
      enum: {
        values: ["post", "comment", "reply", "user"],
        message: "Content type must be either post, comment, reply, or user",
      },
      required: [true, "An appeal must have a content type"],
    },
    reportedContentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, "An appeal must have a reported content ID"],
      index: true,
    },
    userReason: {
      type: String,
      required: [true, "An appeal must have a reason"],
    },
    status: {
      type: String,
      enum: {
        values: ["pending", "accepted", "rejected"],
        message: "Status must be either pending, accepted, or rejected",
      },
      default: "pending",
    },
    originalAction: {
      type: String,
      enum: {
        values: ["hide_content", "ban_user", "delete_account"],
        message:
          "Action taken must be either hide_content, ban_user, delete_account",
      },
      required: [true, "An appeal must have an original action taken"],
    },
    moderatorNotes: String,
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    resolvedAt: Date,
  },
  {
    timestamps: true,
  }
);

const Appeal = mongoose.model("Appeal", appealSchema);

module.exports = Appeal;
