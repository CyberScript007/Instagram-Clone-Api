const mongoose = require("mongoose");

const PostCommentReplyLikeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Please provide user that like the reply comment post"],
      index: true,
    },
    postCommentReply: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PostCommentReply",
      required: [
        true,
        "Please provide the reply comment the user want to like",
      ],
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// prevent user from liking the reply comment multiple times
PostCommentReplyLikeSchema.index(
  { user: 1, postCommentReply: 1 },
  { unique: true }
);

// populate user details
PostCommentReplyLikeSchema.pre(/^find/, function (next) {
  this.populate({
    path: "user",
    select: "name username photo",
  });

  next();
});

const PostCommentReplyLike = mongoose.model(
  "PostCommentReplyLike",
  PostCommentReplyLikeSchema
);

module.exports = PostCommentReplyLike;
