const mongoose = require("mongoose");
const PostCommentReply = require("../PostCommentReply/postCommentReplyModel");

const PostCommentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Please provide user id"],
      index: true,
    },
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: [true, "Please provide post id"],
      index: true,
    },
    text: {
      type: String,
      maxLength: [1000, "comment should not exceed 1000 words"],
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

// get all comment likes
// PostCommentSchema.virtual("PostCommentLikes", {
//   ref: "PostCommentLike",
//   foreignField: "postComment",
//   localField: "_id",
// });

// get all comment replies
// PostCommentSchema.virtual("PostCommentReplies", {
//   ref: "PostCommentReply",
//   foreignField: "postComment",
//   localField: "_id",
// });

// get all the number of a post comment replies
PostCommentSchema.virtual("PostCommentReplyCount", {
  ref: "PostCommentReply",
  foreignField: "postComment",
  localField: "_id",
  count: true,
});

// store the number of comment like into the post comment schema
PostCommentSchema.virtual("PostCommentLikeCount", {
  ref: "PostCommentLike",
  foreignField: "postComment",
  localField: "_id",
  count: true,
});

// populate the user that comment on a post
PostCommentSchema.pre(/^find/, function (next) {
  this.populate({ path: "user", select: "name username photo accountStatus" })
    .populate("PostCommentLikeCount")
    .populate("PostCommentReplyCount");
  next();
});

const PostComments = mongoose.model("PostComments", PostCommentSchema);

module.exports = PostComments;
