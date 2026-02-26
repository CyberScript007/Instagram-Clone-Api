const mongoose = require("mongoose");

const PostCommentReplySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Please provide the user that want to reply comment"],
      index: true,
    },
    postComment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PostComments",
      required: [
        true,
        "please provide the post comment the user want to reply",
      ],
      index: true,
    },
    text: {
      type: String,
      trim: true,
      maxLength: [1000, "You reply should not exceed 1000 words"],
    },
    isHidden: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// get all comment replies likes
PostCommentReplySchema.virtual("PostCommentRepliesLikes", {
  ref: "PostCommentReplyLike",
  foreignField: "postCommentReply",
  localField: "_id",
});

// store the post comment replies likes number into post comment reply schema
PostCommentReplySchema.virtual("PostCommentReplyLikeCount", {
  ref: "PostCommentReplyLike",
  foreignField: "postCommentReply",
  localField: "_id",
  count: true,
});

// populate the user details
PostCommentReplySchema.pre(/^find/, function (next) {
  this.populate({
    path: "user",
    select: "name username photo accountStatus",
  });

  next();
});

const PostCommentReply = mongoose.model(
  "PostCommentReply",
  PostCommentReplySchema
);

module.exports = PostCommentReply;
