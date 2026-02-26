const mongoose = require("mongoose");

const audioCollectionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Audio collection must have a user"],
      index: true,
    },
    name: {
      type: String,
      required: [true, "Audio collection must have a name"],
      default: "Audio",
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// populate the user that own the audio collection
// audioCollectionSchema.pre(/^find/, )

const AudioCollection = mongoose.model(
  "AudioCollection",
  audioCollectionSchema
);

module.exports = AudioCollection;
