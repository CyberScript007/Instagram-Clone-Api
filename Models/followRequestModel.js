const mongoose = require("mongoose");

const followRequestSchema = new mongoose.Schema(
  {
    requestedUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [
        true,
        "There must be a user requesting to follow a private user ",
      ],
    },
    privateUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "There must be a private account user"],
    },
  },
  {
    timestamps: true,
  }
);

// index both requestedUser and privateUser field for easy lookup in the database and make the field unique
followRequestSchema.index(
  { requestedUser: 1, privateUser: 1 },
  { unique: true }
);

const FollowRequest = mongoose.model("FollowRequest", followRequestSchema);

module.exports = FollowRequest;
