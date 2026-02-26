const mongoose = require("mongoose");

const savedAudioSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "A saved audio record must belong to a user"],
      index: true,
    },
    audio: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AudioExtractedFromVideo",
      required: [true, "A saved audio record must refernce to an audio assets"],
      index: true,
    },
    audioCollection: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AudioCollection",
      required: [true, "A saved audio must have an audio collection"],
    },
    deleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    savedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to prevent user from duplicate saves
savedAudioSchema.index({ user: 1, audio: 1 }, { unique: true });

// ---
// Mongoose Pre-Find Middleware: Automatically populate the audio details
// when querying the saved list, reducing subsequent database lookups.
// ---
savedAudioSchema.pre(/^find/, function (next) {
  this.populate("audio", "url title originalUser usageCount duration");
  next();
});

const SavedAudio = mongoose.model("SavedAudio", savedAudioSchema);

module.exports = SavedAudio;
