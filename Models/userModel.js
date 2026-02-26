const mongoose = require("mongoose");
const validator = require("validator");
const bcrypt = require("bcryptjs");

const PostCollection = require("./Post/PostCollection/PostCollectionModel");
const AudioCollection = require("./Audio/audioCollectionModel");

const UserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "User must have a name"],
      lowercase: true,
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Please provide your email"],
      validate: [validator.isEmail, "Please provide a valid email"],
      lowercase: true,
      unique: true,
    },
    otp: String,
    otpExpiredAt: Date,
    photo: {
      type: String,
      default: `${process.env.DEVELOPMENT_URL}img/user/default.jpg`,
    },
    username: {
      type: String,
      required: [true, "Please provide your username"],
      lowercase: true,
      unique: true,
      minLength: [
        6,
        "Minimum characters for username is 6, please input 6 charaters and above",
      ],
      trim: true,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    isPrivate: {
      type: Boolean,
      default: false,
      index: true,
    },
    privacyToggleTime: {
      type: Date,
      default: null,
      select: false,
    },
    privacyChangeStatus: {
      type: String,
      enum: {
        values: ["ready", "processing", "failed"],
        message:
          "Privacy change status should only consist ready, processing and failed",
      },
      default: "ready",
    },
    role: {
      type: String,
      enum: {
        values: ["user", "admin", "moderator"],
        message: `role field should only contains user, admin and moderator`,
      },
      default: "user",
    },
    bio: {
      type: String,
      maxLength: [150, "Your bio must not be more than 150 characters long"],
    },
    gender: {
      type: String,
      default: "prefer not to say",
      trim: true,
    },
    canBeSuggested: {
      type: Boolean,
      default: true,
      index: true,
    },
    isPopularUser: {
      type: Boolean,
      default: false,
      index: true,
    },
    followerCount: {
      type: Number,
      default: 0,
    },
    followingCount: {
      type: Number,
      default: 0,
    },
    accountStatus: {
      type: String,
      enum: {
        values: ["active", "suspended", "deleted"],
        message: `accountStatus field should only contains active, suspended and deleted`,
      },
      default: "active",
    },
    hasActiveStory: {
      type: Boolean,
      default: false,
    },
    warnings: {
      type: [
        {
          reason: String,
          issuedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },
          createdAt: Date,
        },
      ],
      select: false,
    },
    banHistory: {
      type: [
        {
          reason: String,
          issuedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },
          createdAt: Date,
          bannedUntil: Date,
        },
      ],
      select: false,
    },
    password: {
      type: String,
      required: [true, "Please provide your password"],
      minLength: [8, "Your password must have minimum of 8 characters long"],
      select: false,
    },
    passwordConfirm: {
      type: String,
      required: [true, "Please confirm your password"],
      validate: {
        validator: function (val) {
          return val === this.password;
        },
        message: "Your password does not match",
      },
    },
    bannedUntil: {
      type: Date,
      default: null,
    },
    passwordChangeAt: Date,
    deletedAt: Date,
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    collation: { locale: "en", strength: 2 },
  },
);

// virtual populate user followers
// UserSchema.virtual("followersCount", {
//   ref: "Follow",
//   localField: "_id",
//   foreignField: "following",
//   count: true,
// });

// virtual populate user following
// UserSchema.virtual("followingCount", {
//   ref: "Follow",
//   localField: "_id",
//   foreignField: "followers",
//   count: true,
// });

// hashing password field before the user is created
UserSchema.pre("save", async function (next) {
  // check if the password is not change and go to next middleware
  if (!this.isModified("password")) return next();

  // hash the password field if the password is been created or change
  if (this.password) {
    this.password = await bcrypt.hash(this.password, 12);
  }

  // remove the passwordConfirm from the database
  this.passwordConfirm = undefined;

  // go to the next middleware
  next();
});

// hashing otp before storing into database
UserSchema.pre("save", async function (next) {
  // check if the otp has not change, if it has not change proceed to the next middleware
  if (!this.isModified("otp")) return next();

  // hash the otp for better security practice
  if (this.otp) {
    this.otp = await bcrypt.hash(this.otp, 12);
  }

  // proceed to next middleware
  next();
});

// add the passwordChangeAt field if the user change is password
UserSchema.pre("save", function (next) {
  // check if the password has not change
  if (!this.isModified("password") || this.isNew) return next();

  // add value to password has been modified
  this.passwordChangeAt = Date.now() - 1000;

  // go to next middleware
  next();
});

// automatically creating default collection when a user is created
UserSchema.post("save", async function (doc, next) {
  // check if there is default all saved collection has been created for the user before
  const existingPostDefaultCollection = await PostCollection.findOne({
    user: doc._id,
    isDefault: true,
  });

  // check if there is audio collection has been created foe the user before
  const existingAudioCollection = await AudioCollection.findOne({
    user: doc._id,
    isDefault: true,
  });

  // if it does not exist create a default collection
  if (!existingPostDefaultCollection) {
    await PostCollection.create({
      user: doc._id,
      isDefault: true,
      name: "All posts",
    });
  }

  // if the audio collection does not exist, then create it for user
  if (!existingAudioCollection) {
    await AudioCollection.create({
      user: doc._id,
      isDefault: true,
    });
  }

  next();
});

// check if the user has change is password
UserSchema.methods.checkUserPasswordDate = function (JWTIssuedDate) {
  // check if the passwordChangeAt exist
  if (this.passwordChangeAt) {
    // convert the passwordChangeAt to milliseconds and convert it to second
    const passwordChangeAt = Math.floor(this.passwordChangeAt.getTime() / 1000);

    // return true if the passwordChangeAt is greater than jwtIsssueDate
    return passwordChangeAt > JWTIssuedDate;
  }

  // return false by default
  return false;
};

// compare if the user otp is eaqul to the database
UserSchema.methods.compareUserOtpAndDatabaseOtp = async function (
  userOtp,
  databaseOtp,
) {
  // use bcrytp to compare both otp number
  return await bcrypt.compare(userOtp, databaseOtp);
};

// comapare user input password to user database password
UserSchema.methods.compareUserPasswordAndDatabasePassword = async function (
  userPassword,
  databasePassword,
) {
  // use bcrytp to check if the password are equal
  return await bcrypt.compare(userPassword, databasePassword);
};

// Create dedicated indexes for efficient prefix matching.
// We only need the index to enforce uniqueness on the username,
// but the collation set above is what enables the fast, case-insensitive search.
// UserSchema.index({ username: 1 });
UserSchema.index({ name: 1, username: 1, email: 1, photo: 1 });

const User = mongoose.model("User", UserSchema);

module.exports = User;
