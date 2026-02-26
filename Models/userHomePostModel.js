const mongoose = require("mongoose");

const userHomePostSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    posts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Post",
      },
    ],
  },
  { timestamps: true }
);
const UserHomePost = mongoose.model("UserHomePosts", userHomePostSchema);

module.exports = UserHomePost;
