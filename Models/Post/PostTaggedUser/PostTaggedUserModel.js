const mongoose = require("mongoose");

const PostTaggedUserSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Tagged post must contain a user id"],
    },
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: [true, "Tagged post must contain a post id"],
    },
    x: {
      type: Number,
      required: [true, "Tagged post X coordinate must be provided"],
    },
    y: {
      type: Number,
      required: [true, "Tagged post Y coordinate must be provided"],
    },
  },
  {
    timestamps: true,
  }
);

// Prevent user from tagged user on a post multiple times
PostTaggedUserSchema.index({ post: 1, user: 1 }, { unique: true });

// Populat the user that were tagged
PostTaggedUserSchema.pre(/^find/, function (next) {
  this.populate({
    path: "user",
    select: "id name username photo accountStatus",
  });
  next();
});

const PostTaggedUser = mongoose.model("PostTaggedUser", PostTaggedUserSchema);

module.exports = PostTaggedUser;
