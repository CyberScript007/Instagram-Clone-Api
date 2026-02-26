const mongoose = require("mongoose");

const audioSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: [true, "Audio must have a url"],
      unique: true,
    },
    title: {
      type: String,
      trim: true,
      default: "Original audio",
    },
    originalUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Audio must be linked to original user"],
      index: true,
    },
    originalPost: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      index: true,
    },
    duration: {
      type: Number,
      required: [true, "Audio duration is required"],
    },
    hash: {
      type: String,
      required: [true, "Audio must have a hash"],
      unique: true,
    },
    usageCount: {
      type: Number,
      default: 0,
    },
    isOriginalAudio: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Add index for performance on frequently queried fields (to find popular audio fast)
// -1 for descending order (most popular first)
audioSchema.index({ usageCount: -1 });

/**
 * Mongoose Pre-Find Middleware: Automatically populate linked documents.
 * This ensures that when querying for audio, we immediately get the user and post details.
 */
audioSchema.pre(/^find/, function (next) {
  this.populate("originalUser", "name username photo");
  next();
});

const AudioExtractedFromVideo = mongoose.model(
  "AudioExtractedFromVideo",
  audioSchema
);

module.exports = AudioExtractedFromVideo;
