const mongoose = require("mongoose");

const PostCollectionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Post collection must have user id"],
      index: true,
    },
    name: {
      type: String,
      required: [true, "A collection must have a name"],
      index: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    deleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// populate the user that own the collection
PostCollectionSchema.pre(/^find/, function (next) {
  this.populate({
    path: "user",
    select: "name username photo",
  });

  next();
});

const PostCollection = mongoose.model("PostCollection", PostCollectionSchema);

module.exports = PostCollection;
