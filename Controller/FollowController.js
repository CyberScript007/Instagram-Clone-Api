const Follow = require("../Models/followModel");
const FollowRequest = require("../Models/followRequestModel");
const NotificationInstagram = require("../Models/NotificationModel");
const User = require("../Models/userModel");

const ApiFeatures = require("../Utils/ApiFeatures");
const catchAsync = require("../Utils/catchAsync");
const sendErrorMiddleware = require("../Utils/sendErrorMiddleware");
const redisClient = require("../Utils/redisClient");

const toggleAccountQueue = require("../Utils/toggleAccountQueue");
const notificationQueue = require("../Utils/notificationQueue");
const userStatusStoryQueue = require("../Utils/userStatusStoryQueue");
const storyFollowQueue = require("../Utils/storyFollowQueue");

// create the mega threshold variable
const MEGA_THRESHOLD = 2;

// create toggle follow controller
exports.toggleFollow = catchAsync(async (req, res, next) => {
  // get the user the logged in user wants to follow or unfollow by destructuring the req.params
  const { userId: userBeenFollowedOrUnfollowedId } = req.params;

  // store the logged in user id into a variable
  const loggedInUser = req.user.id;

  // send error to user if the logged in user want to follow itself
  if (userBeenFollowedOrUnfollowedId === String(loggedInUser)) {
    return next(new sendErrorMiddleware("You cannot follow your self", 400));
  }

  // check if the user the logged in user want to follow or unfollow exist
  const user = await User.findById(userBeenFollowedOrUnfollowedId);

  if (!user) {
    return next(
      new sendErrorMiddleware(
        "The user you are trying to follow or unfollow does not exists",
        404,
      ),
    );
  }

  // check if the logged in user is already following the user, then unfollow the user. Decrease the logged in user following count by 1 and decrease the follower count of the user being unfollow by 1
  const alreadyFollowing = await Follow.findOne({
    follower: loggedInUser,
    following: userBeenFollowedOrUnfollowedId,
  });

  if (alreadyFollowing) {
    // unfollow the userID
    await Follow.findByIdAndDelete(alreadyFollowing._id);

    // decrease the logged in user following count by 1
    await User.findByIdAndUpdate(
      loggedInUser,
      {
        $inc: { followingCount: -1 },
      },
      { new: true, runValidators: true },
    );

    // decrease the follower count of the user the logged in user is following by 1
    const userBeenUnfollowed = await User.findByIdAndUpdate(
      userBeenFollowedOrUnfollowedId,
      { $inc: { followerCount: -1 } },
      { new: true, runValidators: true },
    );

    // check if the follower count of the user the logged in user unfollow is less than mega threshold, then change isPopularUser field to false
    if (
      userBeenUnfollowed.followerCount < MEGA_THRESHOLD &&
      userBeenUnfollowed.isPopularUser
    ) {
      userBeenUnfollowed.isPopularUser = false;
      await userBeenUnfollowed.save({ validateBeforeSave: false });

      // add user been unfollowed to user status story queue and downgrade their status from popular to regular user
      await userStatusStoryQueue.add(
        "user-status-story",
        {
          storyCreator: userBeenFollowedOrUnfollowedId,
          status: "downgrade",
        },
        {
          priority: 3,
          attempts: 2, // retry the job twice if it fails to process the job, this is useful when there is a temporary error such as network error or database connection error
          lifo: true, // process the job in LIFO order to make sure the most recent user status change is processed first
          removeOnComplete: true, // remove the job from the queue when it is completed to prevent the queue from growing indefinitely
        },
      );
    }

    // Add the story follow job to story queue to remove the unfollowed user from viewing the stories of the user they unfollowed
    await storyFollowQueue.add(
      "story-follow",
      {
        action: "unfollow",
        loggedInUser,
        storyCreator: userBeenFollowedOrUnfollowedId,
        isPopularUser: userBeenUnfollowed.isPopularUser,
      },
      {
        priority: 2,
        attempts: 3, // retry the job up to 3 times if it fails, this is useful when there is a temporary error such as network error or database connection error
        jobId: `story-follow-${loggedInUser}-${userBeenFollowedOrUnfollowedId}`, // unique job ID to prevent duplicate jobs for the same follow action
        backoff: {
          type: "fixed",
          delay: 1000, // fixed delay of 1 second before retrying the job if it fails
        },
        removeOnComplete: true, // remove the job from the queue when it is completed to prevent the queue from growing indefinitely
        removeOnFail: { count: 50 }, // keep the latest 50 failed jobs in the queue and remove the rest to prevent the queue from growing indefinitely
      },
    );

    // send response to the user
    return res.status(200).json({
      status: "success",
      isFollow: false,
      message: "You have successfully unfollowed user ",
    });
  }

  // check if the userBeenFollowedOrUnfollowedId account is a private account
  if (user.isPrivate) {
    // check if the logged in user have sent a request to follow the userBeenFollowedOrUnfollowedId, then cancel the follow request
    const alreadySentFollowingRequest = await FollowRequest.findOne({
      requestedUser: loggedInUser,
      privateUser: userBeenFollowedOrUnfollowedId,
    });

    if (alreadySentFollowingRequest) {
      // cancel the following request sent
      await FollowRequest.findByIdAndDelete(alreadySentFollowingRequest._id);

      // delete the corresponding follow request notification
      await NotificationInstagram.findOneAndDelete({
        receiver: userBeenFollowedOrUnfollowedId,
        sender: loggedInUser,
        type: "follow_request",
      });

      // send response to user
      return res.status(200).json({
        status: "success",
        isCancelRequest: true,
        message: "Follow request cancel",
      });
    } else {
      // create follow request
      await FollowRequest.create({
        requestedUser: loggedInUser,
        privateUser: userBeenFollowedOrUnfollowedId,
      });

      // Add notification for the private user about pending request
      await notificationQueue.add(
        {
          receiver: userBeenFollowedOrUnfollowedId,
          sender: loggedInUser,
          type: "follow_request",
          message: `${loggedInUser} sent you a follow request`,
        },
        {
          priority: 5,
          removeOnComplete: { count: 1000 }, // keep the latest 1000 completed jobs in the queue and remove the rest to prevent the queue from growing indefinitely
          removeOnFail: { age: 24 * 3600 }, // remove the failed jobs after 24 hours to prevent the queue from growing indefinitely
          attempts: 2, // retry the job twice if it fails to process the job, this is useful when there is a temporary error such as network error or database connection error
        },
      );

      // send response to user
      return res.status(202).json({
        status: "Pending",
        isCancelRequest: false,
        message: "Follow request sent to you",
      });
    }
  } else {
    // public account logic
    // create the following logic for public account
    await Follow.create({
      follower: loggedInUser,
      following: userBeenFollowedOrUnfollowedId,
    });

    // increase the following count of the logged in use by 1
    await User.findByIdAndUpdate(
      loggedInUser,
      { $inc: { followingCount: 1 } },
      { new: true, runValidators: true },
    );

    // increase the follower count of the user the logged in user is following by 1
    const userBeenFollowed = await User.findByIdAndUpdate(
      userBeenFollowedOrUnfollowedId,
      { $inc: { followerCount: 1 } },
      { new: true, runValidators: true },
    );

    // check if the follower count of the user the logged in user follow is greater than or equal mega threshold, then change isPopularUser field to true
    if (
      userBeenFollowed.followerCount >= MEGA_THRESHOLD &&
      !userBeenFollowed.isPopularUser
    ) {
      userBeenFollowed.isPopularUser = true;
      await userBeenFollowed.save({ validateBeforeSave: false });

      // add user been followed to user status story queue and upgrade their status from regular to popular user
      await userStatusStoryQueue.add(
        "user-status-story",
        {
          storyCreator: userBeenFollowedOrUnfollowedId,
          status: "upgrade",
        },
        {
          priority: 3,
          attempts: 2, // retry the job twice if it fails to process the job, this is useful when there is a temporary error such as network error or database connection error
          lifo: true, // process the job in LIFO order to make sure the most recent user status change is processed first
          removeOnComplete: true, // remove the job from the queue when it is completed to prevent the queue from growing indefinitely
        },
      );
    }

    // Add the story follow job to story queue to add the followed user stories to the logged in user story feed
    await storyFollowQueue.add(
      "story-follow",
      {
        action: "follow",
        storyCreator: userBeenFollowedOrUnfollowedId,
        isPopularUser: userBeenFollowed.isPopularUser,
        loggedInUser,
      },
      {
        priority: 2,
        attempts: 3, // retry the job up to 3 times if it fails, this is useful when there is a temporary error such as network error or database connection error
        jobId: `story-follow-${loggedInUser}-${userBeenFollowedOrUnfollowedId}`, // unique job ID to prevent duplicate jobs for the same follow action
        backoff: {
          type: "fixed",
          delay: 1000, // fixed delay of 1 second before retrying the job if it fails
        },
        removeOnComplete: true, // remove the job from the queue when it is completed to prevent the queue from growing indefinitely
        removeOnFail: { count: 50 }, // keep the latest 50 failed jobs in the queue and remove the rest to prevent the queue from growing indefinitely
      },
    );

    // add notification for the public user about the new follower
    await notificationQueue.add(
      {
        receiver: userBeenFollowedOrUnfollowedId,
        sender: loggedInUser,
        type: "follow",
        message: `${loggedInUser} started following you`,
      },
      {
        priority: 5,
        removeOnComplete: { count: 1000 }, // keep the latest 1000 completed jobs in the queue and remove the rest to prevent the queue from growing indefinitely
        removeOnFail: { age: 24 * 3600 }, // remove the failed jobs after 24 hours to prevent the queue from growing indefinitely
        attempts: 2, // retry the job twice if it fails to process the job, this is useful when there is a temporary error such as network error or database connection error
      },
    );

    // send response to the user
    res.status(200).json({
      status: "success",
      isFollow: true,
      message: "Successfully followed user",
    });
  }
});

// create toggle account controller
exports.toggleAccount = catchAsync(async (req, res, next) => {
  // store the logged in user into a variable
  const loggedInUser = req.user.id;

  // check if the logged in user exist
  const user = await User.findById(loggedInUser).select(
    "isPrvate privacyToggleTime privacyChangeStatus",
  );

  if (!user) {
    return next(new sendErrorMiddleware("User not found", 404));
  }

  // Implement the toggle account logic
  const oldPrivateStatus = user.isPrivate;
  const newPrivateStatus = !oldPrivateStatus;

  // store the logged in user privacyToggleTime vale in a variable, so it can be use in the toggleAccountContentJob to determine if the user switch from private to public account before 24hours lapse
  const previousToggleTime = user.privacyToggleTime;

  // update the logged in user immediately
  const updatedUser = await User.findByIdAndUpdate(
    loggedInUser,
    {
      isPrivate: newPrivateStatus,
      privacyToggleTime: new Date(),
      privacyChangeStatus: "ready",
    },
    { new: true, runValidators: true },
  );

  // store the necessary parameter that would be pass into the toggle account content job into an object
  const contentJobData = {
    userId: loggedInUser,
    privacyStatus: newPrivateStatus,
    previousToggleTime,
  };

  // create a status message
  let statusMessage;

  // check if the user switch from public to private
  if (newPrivateStatus) {
    // add the toggle account content job to the queue, to restrict the user post, reels, stories.. from being reuse from other user and to temporary delete all the derivative posts, reels or stories.
    await toggleAccountQueue.add("toggleContent", contentJobData);

    statusMessage =
      "Account set to **private**. Content restriction and cleanup are running in the background. The 24-hour grace period has started.";
  } else {
    // if the user toggle from private to public, accept all the pending follow request for the user by toggleAccountFollowerJob and delete all the derivative posts, reels or stories if the user does not switch is account to public after 24 hours lapse. But if the user switch if account to public before 24hours lapse restore all derivative posts, reels or stories and let the user posts be available for reuse
    await toggleAccountQueue.add("toggleContent", contentJobData);

    await toggleAccountQueue.add("toggleFollowers", { userId: loggedInUser });

    statusMessage =
      "Account set to **public**. Follow requests are being accepted and content restoration is underway in the background.";
  }

  // send response to user
  res.status(200).json({
    status: "success",
    message: `Account successfully toggled to ${
      newPrivateStatus ? "private" : "public"
    }`,
    privacyChangeStatus: updatedUser.privacyChangeStatus,
    details: statusMessage,
  });
});

// accept and reject request for user
exports.acceptAndRejectRequest = catchAsync(async (req, res, next) => {
  // get the follow request id by destructuring the req.params
  const { followRequestId } = req.params;

  // store the logged in private user into a variable
  const loggedInPrivateUser = req.user.id;

  // get the  action value by destructuring the req.body
  const { action } = req.body;

  // check if the follow request id exist
  const followRequest = await FollowRequest.findOne({
    _id: followRequestId,
    privateUser: loggedInPrivateUser,
  });

  if (!followRequest) {
    return next(
      new sendErrorMiddleware("The follow request is not found", 404),
    );
  }

  // get the user that sent follow request to the private user account
  const requestedUserId = followRequest.requestedUser;

  // delete the request from the follow request document
  await FollowRequest.findByIdAndDelete(followRequestId);

  // perform the action logic
  switch (action) {
    case "accept":
      // create the following logic for private user
      await Follow.create({
        follower: requestedUserId,
        following: loggedInPrivateUser,
      });

      // increase the following count of the user that sent the follow request
      await User.findByIdAndUpdate(
        requestedUserId,
        {
          $inc: { followingCount: 1 },
        },
        { new: true, runValidators: true },
      );

      // increase the follower count of the private user
      await User.findByIdAndUpdate(
        loggedInPrivateUser,
        {
          $inc: { followerCount: 1 },
        },
        { new: true, runValidators: true },
      );

      // check if the logged in private user is a mega user, if yes add the logged in private user to the requested user mega following list
      const isPopularUser = await redisClient.sIsMember(
        "active_mega_story_creators",
        loggedInPrivateUser,
      );

      if (isPopularUser) {
        await redisClient.sAdd(
          `popular_users_following:${requestedUserId}`,
          loggedInPrivateUser,
        );
      }

      return res.status(200).json({
        status: "success",
        message: `Requested accepted, User ${requestedUserId} is now following you`,
      });

    case "reject":
      return res.status(200).json({
        status: "success",
        message: "Requested rejected",
      });

    default:
      return next(
        new sendErrorMiddleware(
          "You can only accept or reject a follow request",
          400,
        ),
      );
      break;
  }
});

// get user followers
exports.getUserFollowers = catchAsync(async (req, res, next) => {
  // store the user id in a variable by destructuring the req.params
  const { userId } = req.params;

  // get the user
  const user = await User.findById(userId);

  // check if the user exist
  if (!user) {
    return next(new sendErrorMiddleware("User not found", 404));
  }

  // store the total number of followers in a variable
  const totalFollowers = await Follow.countDocuments({ following: userId });

  // use ApiFeaturs on the follow model such as pagination, sorting, filtering and so on
  const features = new ApiFeatures(
    req.query,
    Follow.find({ following: userId }).populate({
      path: "follower",
      select: "name username photo createdAt",
    }),
  )
    .filter()
    .sort()
    .limitFields()
    .pagination();

  // store the query into a variable
  const followers = await features.query;

  // store only the followers in to a new array
  const followersArray = followers.map((f) => f.follower);

  // send the number of followers to the user
  res.status(200).json({
    status: "success",
    totalFollowers,
    data: { followersArray }, // send only the followers as response
  });
});

// get all the users that the user is following
exports.getUserFollowing = catchAsync(async (req, res, next) => {
  // store the user id in a variable by destructuring the req.params
  const { userId } = req.params;

  // get the user
  const user = await User.findById(userId);

  // check if the user exist
  if (!user) {
    return next(new sendErrorMiddleware("User not found", 404));
  }

  // get all the number of of people following the user
  const totalFollowing = await Follow.countDocuments({
    follower: userId,
  });

  // add some functionalities to the following query such as pagination, sorting filtering and so on
  const features = new ApiFeatures(
    req.query,
    Follow.find({ follower: req.params.userId }).populate({
      path: "following",
      select: "name username photo createdAt",
    }),
  )
    .filter()
    .sort()
    .limitFields()
    .pagination();

  // store the query inside a variable
  const following = await features.query;

  // store only the following users in to a new array
  const followingArray = following.map((f) => f.following);

  // send the number of followers to the user
  res.status(200).json({
    status: "success",
    totalFollowing,
    data: { followingArray }, // send only following as response
  });
});
