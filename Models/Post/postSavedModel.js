const mongoose = require("mongoose");

const PostSavedSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Post saved must have a user"],
      index: true,
    },
    post: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      required: [true, "There must be a post to be save"],
      index: true,
    },
    postCollection: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PostCollection",
      required: [true, "A post saved should have a collection to be store"],
    },
    cachedPost: {
      caption: String,
      hashtags: [String],
      media: {
        url: String,
        mediaType: String,
        thumbnail: String,
      },
      hideLikes: Boolean,
      hideComment: Boolean,
      isSponsored: Boolean,
      postLikeCount: Number,
      postCommentCount: Number,
      user: {
        id: String,
        name: String,
        username: String,
        photo: String,
      },
      createdAt: Date,
    },
    deleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Prevent the user from saving the post twice
// PostSavedSchema.index({ user: 1, post: 1 }, { unique: true });

// populate the postCollection
PostSavedSchema.pre(/^find/, function (next) {
  this.populate({
    path: "postCollection",
    select: "name",
  });

  next();
});

const PostSaved = mongoose.model("PostSaved", PostSavedSchema);

module.exports = PostSaved;
