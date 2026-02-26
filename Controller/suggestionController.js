const { default: mongoose } = require("mongoose");
const Follow = require("../Models/followModel");
const User = require("../Models/userModel");

const catchAsync = require("../Utils/catchAsync");
const sendErrorMiddleware = require("../Utils/sendErrorMiddleware");

exports.toggleCanBeSuggested = catchAsync(async (req, res, next) => {
  // store the logged in user id into a variable
  const loggedInUser = req.user.id;

  // destructure the canBeSuggested field from the request body
  const { canBeSuggested } = req.body;

  // check if the user pass the canBeSuggested field in the request body and if it's a boolean value
  if (!canBeSuggested && typeof canBeSuggested !== "boolean") {
    return next(
      new sendErrorMiddleware(
        "canBeSuggested field is required and must be a boolean value",
        400
      )
    );
  }

  // find and update the logged in user canBeSuggested field
  const updatedUser = await User.findByIdAndUpdate(
    loggedInUser,
    { canBeSuggested },
    { new: true, runValidators: true }
  ).select("+canBeSuggested");

  // check if the user exist
  if (!updatedUser) {
    return next(new sendErrorMiddleware("User not found", 404));
  }

  // send reponse to the user
  res.status(200).json({
    status: "success",
    data: {
      user: updatedUser,
    },
  });
});

exports.getSuggestions = catchAsync(async (req, res, next) => {
  // define the limit constants
  const LIMIT_SUGGESTION_USERS = 15;
  const PRE_LIMIT_SUGGESTION_USERS = LIMIT_SUGGESTION_USERS * 5;

  // store the logged in user into a variable
  const loggedInUser = req.user.id;

  // convert the logged in user id to an objectId
  const loggedInUserObjectId =
    mongoose.Types.ObjectId.createFromHexString(loggedInUser);

  // find all the users the logged in user is following and only select the following field
  const loggedInUserFollowing = await Follow.find({
    follower: loggedInUser,
  }).select("following -_id");

  // put the following Ids into a new array
  const loggedInUserFollowingIds = loggedInUserFollowing.map(
    (follow) => follow.following
  );

  // join both  the logged in users is following and the logged in user id into a single array
  const excludedUsers = [...loggedInUserFollowingIds, loggedInUserObjectId];

  // create the aggregation pipeline for the suggestion users
  const suggestions = await User.aggregate([
    // Match all users that meet the basic criteria:
    {
      $match: {
        // must be discoverable
        canBeSuggested: true,
        // exclude both the logged in user and the users the logged in user followed
        _id: { $nin: excludedUsers },
        // the user account must be active
        accountStatus: "active",
      },
    },

    // calculate the mutual friends for the logged in user
    {
      $lookup: {
        // loop through the follow model, check where the users logged in user follows is equal to the users that are following the current user document
        from: "follows",
        let: { userCurrentDocumentId: "$_id" },
        pipeline: [
          // step 1: loop through the users document in the database and filter out where the current user document id is being followed by other users
          {
            $match: {
              $expr: {
                $eq: ["$following", "$$userCurrentDocumentId"],
              },
            },
          },

          // Step 2: From the followers found in Step 1, check if the ID in the 'follower' field is present in the loggedInUserFollowingIds array. These are your mutual friends.
          {
            $match: {
              follower: { $in: loggedInUserFollowingIds },
            },
          },

          // count the number of mutual friends found
          { $count: "mutualFriendsCount" },
        ],
        as: "mutualFriendsData",
      },
    },

    // loop through the post likes in the database, get all the post like by the logged in user
    {
      $lookup: {
        from: "postlikes",
        // store the user current document id and the logged in user id into a variable to be able to use it in the pipeline
        let: { userCurrentDocumentId: "$_id", loggedInUserId: loggedInUser },
        pipeline: [
          // match all the post likes where the user is the logged in user
          {
            $match: {
              $expr: { $eq: ["$user", "$$loggedInUserId"] },
            },
          },

          // look up the post being get from the match to retrieve it from the database
          {
            $lookup: {
              from: "posts",
              localField: "post",
              foreignField: "_id",
              as: "postDetails",
            },
          },

          // unwind the post details array to be able to access the each post details object
          { $unwind: "$postDetails" },

          // filter out where the post creator is equal to the user current document id
          {
            $match: {
              $expr: { $eq: ["$postDetails.user", "$$userCurrentDocumentId"] },
            },
          },

          // count the number of posts like found
          {
            $count: "postsLikedCount",
          },
        ],
        as: "postsLikedData",
      },
    },

    // add the mutual friends count and post likes count into the user document
    {
      $addFields: {
        mutualFriendsField: {
          // check if the mutualFriendsData array is not empty, then get the mutualFrienddsData value else set it to 0. Also extract the value from the array using $arrayElemAt
          $ifNull: [
            { $arrayElemAt: ["$mutualFriendsData.mutualFriendsCount", 0] },
            0,
          ],
        },

        // check if the postsLikedData array is not empty, then get the postsLikedData value else set it to 0. Also extract the value from the array using $arrayElemAt
        postsLikedField: {
          $ifNull: [
            { $arrayElemAt: ["$postsLikedData.postsLikedCount", 0] },
            0,
          ],
        },

        // if both the mutualFriends and possliked field is 0, create a new field which will check if any of the field is greater than 0, to be used to sort against the newly created users that have no mutual friends nor posts liked by the logged in user
        priorityField: {
          $cond: {
            // IF any of these three conditions are TRUE:
            if: {
              $or: [
                // 1. Has Mutual Friends (> 0)
                {
                  $gt: [
                    {
                      $arrayElemAt: [
                        "$mutualFriendsData.mutualFriendsCount",
                        0,
                      ],
                    },
                    0,
                  ],
                },
                // 2. Has Liked Posts (> 0)
                {
                  $gt: [
                    { $arrayElemAt: ["$postsLikedData.postsLikedCount", 0] },
                    0,
                  ],
                },
                // 3. Has a High Follower Count (e.g., > 100)
                {
                  $gt: ["$followerCount", 2],
                },
              ],
            },
            // THEN assign a score of 1 (VIP)
            then: 1,
            // ELSE assign a score of 0 (General Admission)
            else: 0,
          },
        },

        followerSortValue: "$follower",
      },
    },

    // sort the suggestion users base on the number of mutual friends and posts liked in descending order. Also sort by the createdAt field to get the newest user first
    {
      $sort: {
        priorityField: -1,
        followerSortValue: -1,
        mutualFriendsField: -1,
        postsLikedField: -1,
        createdAt: -1,
      },
    },

    // limit the number of suggestion users to the size of the PRE_LIMIT_SUGGESTION_USERS constant
    {
      $limit: PRE_LIMIT_SUGGESTION_USERS,
    },

    // use the $sample stage to randomly select the number of users from the pre-limites suggestion users
    {
      $sample: { size: LIMIT_SUGGESTION_USERS },
    },

    // finally project only the necessary fields to be sent to the user
    {
      $project: {
        _id: 1,
        name: 1,
        username: 1,
        photo: 1,
        mutualFriendsField: 1,
        postsLikedField: 1,
        priorityField: 1,
      },
    },
  ]);

  // send the response to the user
  res.status(200).json({
    status: "success",
    results: suggestions.length,
    data: {
      suggestions,
    },
  });
});
