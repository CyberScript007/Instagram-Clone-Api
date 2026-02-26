const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "A message must have a sender"],
    },
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: [true, "A message must belong to a conversation"],
    },
    repliedToID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
      default: null,
    },
    text: { type: String, trim: true },
    type: {
      type: String,
      enum: {
        values: [
          "text",
          "image",
          "video",
          "audio",
          "gif",
          "call_event",
          "media",
          "document",
        ],
        message:
          "Message type is either: text, image, video, audio, gif, call_event, media or document ",
      },
    },
    media: [
      {
        url: {
          type: String,
          required: [true, "Media must have a url"],
        },
        mediaType: {
          type: String,
          enum: {
            values: ["image", "video", "audio", "gif", "document"],
            message:
              "Media type is either: image, video, audio, gif or document",
          },
          required: [true, "Media must a type"],
        },
        thumbnail: String,
      },
    ],
    deliveredTo: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Array of user IDs who have received the message

    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }], // Array of user IDs who have read the message
    reactions: [
      {
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        emoji: String,
      },
    ], // Array of reactions with user IDs and reaction types
    callEvent: {
      type: {
        type: String,
        enum: {
          values: ["missed", "rejected", "ended", "accepted"],
          message:
            "Call event type is either: missed, rejected, ended, accepted",
        },
      },
      callType: {
        type: String,
        enum: {
          values: ["audio", "video"],
          message: "Call type is either: audio, video",
        },
      },
      callDuration: { type: Number }, // in seconds
    },
    isForward: {
      type: Boolean,
      default: false,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    isHidden: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

// use middleware to populate the sender whenever user try to use find query
messageSchema.pre(/^find/, function (next) {
  this.populate("sender", "name email photo").populate(
    "repliedToID",
    "sender text media type",
  );

  next();
});

const Message = mongoose.model("Message", messageSchema);

module.exports = Message;
