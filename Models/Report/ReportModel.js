const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Report must have a reporter"],
      index: true,
    },
    reportedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Report must have a user been reported"],
      index: true,
    },
    reportedContent: {
      type: mongoose.Schema.Types.ObjectId,
      required: [
        true,
        "Report must have a content ID e.g Post, Comment, Comment Replies, Message or User model",
      ],
      index: true,
    },
    contentType: {
      type: String,
      enum: {
        values: ["post", "comment", "reply", "message", "user"],
        message:
          "The content type should only contains post, comment, reply. message and user",
      },
    },
    reason: {
      type: String,
      enum: {
        values: [
          "It's spam",
          "Nudity or sexual activity",
          "Hate speech or symbols",
          "Violence or dangerous organizations",
          "Sale of illegal or regulated goods",
          "Bullying or harassment",
          "Intellectual property violation",
          "False information",
          "Suicide, self-injury or eating disorders",
          "Drugs",
          "I just don't like it",
          "Bullying or unwanted contact",
          "Violence, hate or exploitation",
          "Selling or promoting restricted items",
          "Scam, fraud or spam",
        ],
        message: "Invalid report reason",
      },
      required: [true, "A report must have a reason"],
    },
    actionType: {
      type: String,
      enum: {
        values: [
          "hide_content",
          "warn_user",
          "ban_user",
          "delete_account",
          null,
        ],
        message:
          "Thee action type should only consist of hide_content, warn_user, ban_user and delete_account",
      },
      default: null,
    },
    description: String,
    status: {
      type: String,
      enum: {
        values: [
          "pending",
          "resolved",
          "under_review",
          "dismissed",
          "escalated",
        ],
        message:
          "The status should only consist of pending, resolved, dismissed, under_review and escalated",
      },
      default: "pending",
    },
    durationDays: Number,
    moderatorNotes: String,
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Optional: Add a compound unique index to prevent a user from repeatedly reporting the *exact same* content for the *exact same* reason
// This index will prevent duplicates if the status is still 'pending' or 'under_review' for that specific reporter-content-reason combo
reportSchema.index(
  { reporter: 1, reportedContent: 1, reason: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["pending", "under_review", "escalated"] },
    },
  }
);

const ReportModel = mongoose.model("ReportModel", reportSchema);

module.exports = ReportModel;
