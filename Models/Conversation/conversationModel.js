const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema(
  {
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: [true, "A conversation must have a participants"],
      },
    ], // Array of user IDs

    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
    isGroupChat: { type: Boolean, default: false },
    groupName: { type: String },
    groupPhoto: [String],
    groupAdmins: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    lastClearedTimestamps: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        timestamps: { type: Date, default: Date.now },
      },
    ],
    hiddenConversations: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  {
    timestamps: true,
  }
);

const Conversation = mongoose.model("Conversation", conversationSchema);

module.exports = Conversation;
