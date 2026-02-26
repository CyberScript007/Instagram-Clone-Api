const mongoose = require("mongoose");

const storySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "A story must belong to a user"],
      index: true,
    },
    mediaUrl: {
      type: String,
      required: [true, "A story must have a media content"],
      index: true,
    },
    mediaType: {
      type: String,
      enum: {
        values: ["image", "video"],
        message: "The media type must contain only the image and video",
      },
      required: [true, "A story must have a media type"],
    },
    thumbnail: String,
    duration: {
      type: Number,
      max: [60, "The story video length should not exceed 60 seconds"],
    },
    aspectRatio: {
      type: String,
      enum: {
        values: ["1:1", "16:9", "9:16"],
        message: "Aspect ratio should be either 1:1, 16:9 or 9:16",
      },
      default: "9:16",
    },
    expiresAt: {
      type: Date,
      required: [true, "A story must have expired date"],
      index: true,
    },
    processingStatus: {
      type: String,
      enum: {
        values: ["ready", "pending", "failed"],
        message:
          "Processing status field should only contain ready, pending and failed values",
      },
      default: "pending",
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// populate the story user photo and name
storySchema.pre(/^find/, function (next) {
  this.populate("user", "name photo email username");

  next();
});

const Story = mongoose.model("Story", storySchema);

module.exports = Story;
