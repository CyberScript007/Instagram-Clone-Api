const mongoose = require("mongoose");

const Post = require("../Models/Post/postModel");
const Follow = require("../Models/followModel");

const catchAsync = require("../Utils/catchAsync");
const sendErrorMiddleware = require("../Utils/sendErrorMiddleware");

// store the explorer feed per page into a variable
const EXPLORE_FEED_PER_PAGE = 20;

// Improve maintainability: Define collection names as constants
// based on my Mongoose virtual references (users, postlikes and postcomments)
const USERS_COLLECTION = "users";
const POSTLIKES_COLLECTION = "postlikes";
const POSTCOMMENTS_COLLECTION = "postcomments";
const FOLLOWS_COLLECTION = "follows";

exports.getExploreFeed = catchAsync(async (req, res, next) => {
  // store the logged in user id into a variable
  const loggedInUserId = req.user.id;

  // get the page number from the query parameters, default to 1 if not provided
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || EXPLORE_FEED_PER_PAGE;
  const skip = (page - 1) * limit;

  // convert loggedInUserId to ObjectId
  const loggedInUserObjectId =
    mongoose.Types.ObjectId.createFromHexString(loggedInUserId);

  // build the aggregation pipeline
  const pipeline = [
    // stage 1: check if the logged in user follow the post author
    {
      $lookup: {
        from: FOLLOWS_COLLECTION,
        let: { postCreatorId: "$user" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$follower", loggedInUserObjectId] }, // match the logged in user as the follower
                  { $eq: ["$following", "$$postCreatorId"] }, // match the post author as the following
                ],
              },
            },
          },
          {
            $project: { _id: 1 }, // only need the _id field
          },
        ],
        as: "isFollowing", // will be an array, if empty means not following
      },
    },

    // stage 2: filter (Exclusion logic)
    {
      $match: {
        // 1. exclude the logged in user post
        user: { $ne: loggedInUserObjectId },

        // 2. exclude the post from users that the logged in user follows
        isFollowing: { $size: 0 },
      },
    },

    // stage 3: lookup for likes count
    {
      $lookup: {
        from: POSTLIKES_COLLECTION,
        localField: "_id",
        foreignField: "post",
        as: "postLikes",
      },
    },

    // add a new field called postLikesCount
    {
      $addFields: {
        postLikesCount: { $size: "$postLikes" },
      },
    },

    // stage 4: lookup for comments count
    {
      $lookup: {
        from: POSTCOMMENTS_COLLECTION,
        localField: "_id",
        foreignField: "post",
        as: "postComments",
      },
    },

    // add a new field called postCommentsCount
    {
      $addFields: {
        postCommentsCount: { $size: "$postComments" },
      },
    },

    // stage 5: sort by createdAt descending (newest first) and then by post likes count in descending order
    {
      $sort: { postLikesCount: -1, createdAt: -1 },
    },

    // stage 6: pagination (skip and limit)
    { $skip: skip },
    { $limit: limit },

    // stage 7: populate the user field (post author)
    {
      $lookup: {
        from: USERS_COLLECTION,
        localField: "user",
        foreignField: "_id",
        as: "user",
      },
    },

    // stage 8: unwind the user array to object
    {
      $unwind: "$user",
    },

    // stage 9: select only the necessary fields to return
    {
      $project: {
        _id: 1,
        media: 1,
        caption: 1,
        postLikesCount: 1,
        postCommentsCount: 1,
        createdAt: 1,
        updatedAt: 1,

        // select only the user fields that we need
        "user._id": 1,
        "user.name": 1,
        "user.username": 1,
        "user.photo": 1,
        "user.email": 1,
      },
    },
  ];

  // execute the aggregation pipeline
  const exploreFeed = await Post.aggregate(pipeline);

  // check if the explorerFeed is empty
  if (exploreFeed.length === 0) {
    return next(
      new sendErrorMiddleware("There are no explorer posts to show", 404)
    );
  }

  // send the response
  res.status(200).json({
    status: "success",
    results: exploreFeed.length,
    page,
    limit,
    data: {
      exploreFeed,
    },
  });
});
