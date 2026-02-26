const mongoose = require("mongoose");

const PostCommentLikeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Provide user that like the comment"],
      index: true,
    },
    postComment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PostComments",
      required: [true, "Provide comment the user will like"],
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// prevent user to like a comment multiple times
PostCommentLikeSchema.index({ user: 1, postComment: 1 }, { unique: true });

// populate the user details that like the postComment
PostCommentLikeSchema.pre(/^find/, function (next) {
  this.populate({
    path: "user",
    select: "name username photo email accountStatus",
  });

  next();
});

const PostCommentLike = mongoose.model(
  "PostCommentLike",
  PostCommentLikeSchema
);

module.exports = PostCommentLike;
