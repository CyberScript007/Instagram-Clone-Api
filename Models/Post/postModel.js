const mongoose = require("mongoose");

const PostSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      required: [true, "A post must have a user"],
      index: true,
    },
    restrictionFlag: {
      type: Date,
      default: null,
      select: false,
    },
    isAvailableForReuse: {
      type: Boolean,
      default: true,
      index: true,
    },
    likesCount: {
      type: Number,
      default: 0,
    },
    commentsCount: {
      type: Number,
      default: 0,
    },
    media: [
      {
        url: {
          type: String,
          required: [true, "Image or video must have a url"],
        },
        mediaType: {
          type: String,
          enum: {
            values: ["image", "video"],
            message: "The media type should only consist Image or Video",
          },
          required: [true, "Media must have a type"],
        },
        thumbnail: String,
        extractedAudioUrl: String,
        duration: {
          type: Number,
          max: [3600, "The video length should not exceed 1 hour"],
        },
        aspectRatio: {
          type: String,
          enum: {
            values: ["1:1", "16:9", "9:16"],
            message: "Aspect ratio should be either 1:1, 16:9 or 9:16",
          },
          default: "1:1",
        },
        processingStatus: {
          type: String,
          enum: {
            values: ["ready", "pending", "failed"],
            message:
              "Processing status should be either pending, completed or failed",
          },
          default: "pending",
        },
        fileHash: String,
      },
    ],
    audioRef: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AudioExtractedFromVideo",
      default: null,
      index: true,
    },
    caption: {
      type: String,
      maxLength: [2200, "Post caption has exceed caption limit"],
    },
    hashtags: [String],
    location: String,
    accessibility: String,
    hideLikes: {
      type: Boolean,
      default: false,
    },
    hideComment: {
      type: Boolean,
      default: false,
    },
    sponsor: {
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    },
    isSponsored: {
      type: Boolean,
      default: false,
    },
    isReels: {
      type: Boolean,
      default: false,
      index: true,
    },
    isHidden: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// check if caption exist to extract any word start with # into hashtags
PostSchema.pre("save", function (next) {
  // if the caption field remain unchanged move to the next middleware
  if (!this.isModified("caption")) return next();
  console.log(!this.isModified("caption"));

  if (this.caption) {
    // extract all the that start with # and convert them into lower case before saving it into the hashtags fields
    this.hashtags =
      this.caption.match(/#(\w+)/g)?.map((tag) => tag.slice(1).toLowerCase()) ||
      [];
  }

  next();
});

// get all the post like
// PostSchema.virtual("postLikes", {
//   ref: "PostLike",
//   foreignField: "post",
//   localField: "_id",
// });

// get all the post comment
// PostSchema.virtual("postComment", {
//   ref: "PostComments",
//   foreignField: "post",
//   localField: "_id",
// });

// get all the tagged post
PostSchema.virtual("taggedPosts", {
  ref: "PostTaggedUser",
  foreignField: "post",
  localField: "_id",
});

// populate how many likes the post has, how many comments the post has, user that created the post and user that sponsor a post
PostSchema.pre(/^find/, function (next) {
  this.populate({
    path: "user",
    select: "name username photo email accountStatus",
  }).populate({
    path: "sponsor.user",
    select: "name username email photo accountStatus",
  });

  next();
});

const Post = mongoose.model("Post", PostSchema);

module.exports = Post;
