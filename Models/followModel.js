const mongoose = require("mongoose");

const FollowSchema = new mongoose.Schema(
  {
    follower: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Follower must have a user"],
    },
    following: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Following must have a user"],
    },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    timestamps: true,
  }
);

// create an index for fast lookup
FollowSchema.index({ follower: 1, following: 1 });

const Follow = mongoose.model("Follow", FollowSchema);

module.exports = Follow;
