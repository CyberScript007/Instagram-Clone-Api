const mongoose = require("mongoose");

const PostLikeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Please provide user that like this post"],
      index: true,
    },
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: [true, "Please provide a post that user will like"],
      index: true,
    },
  },
  { timestamps: true }
);

const PostLike = mongoose.model("PostLike", PostLikeSchema);

module.exports = PostLike;
