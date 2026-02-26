const mongoose = require("mongoose");
const Post = require("../../../Models/Post/postModel");
const PostTaggedUser = require("../../../Models/Post/PostTaggedUser/PostTaggedUserModel");
const catchAsync = require("../../../Utils/catchAsync");
const sendErrorMiddleware = require("../../../Utils/sendErrorMiddleware");
const User = require("../../../Models/userModel");
const notificationQueue = require("../../../Utils/notificationQueue");
const Follow = require("../../../Models/followModel");

// create tagged user post
exports.createTaggedPost = catchAsync(async (req, res, next) => {
  // get the post id from the user by destructuring req.params
  const { postId } = req.params;

  // store the logged in user into a variable
  const loggedInUser = req.user._id;

  // get the tags array of objects from user by destructuring req.body
  const { tags } = req.body; // the tags [{user: 681a1209c1fc66a3afc8ae31, x: 0.2, y: 0.4}, ...] for x and y coordinate the 0.2 and 0.4 represent 20% width and 40% height of the screen

  // check if the tags is an array and the tags is not empty
  if (!Array.isArray(tags) || tags.length === 0) {
    return next(
      new sendErrorMiddleware(
        "tags property must contain array of objects and should not be empty",
        400,
      ),
    );
  }

  // extract all the user Ids being tagged
  const taggedUserIds = tags.map((tag) => tag.user);

  // check if the post exist
  const post = await Post.findById(postId);

  if (!post) {
    return next(
      new sendErrorMiddleware(
        "This post cannot be found or has been deleted",
        404,
      ),
    );
  }

  // check if the post was created by the user
  const isPostCreator = String(post.user._id) === String(loggedInUser);

  if (!isPostCreator) {
    return next(
      new sendErrorMiddleware(
        "You cannot tagged user a post that is not created by you",
        400,
      ),
    );
  }

  // check if all the tagged user exists and only select the user id
  const existingUsers = await User.find({ _id: { $in: { taggedUserIds } } })
    .select("_id")
    .lean();

  // select only the _id value into a unique array for fast look up
  const existingUsersIds = new Set(existingUsers.map((user) => user._id));

  // filter all the user that does not exist from the tags field
  const invalidUsersTag = tags.filter(
    (tag) => !existingUsersIds.has(String(tag.user)),
  );

  // check if the invalidUsers array is greater than 0
  if (invalidUsersTag.length > 0) {
    return next(
      new sendErrorMiddleware(
        `Invalid user IDs found in tags: ${invalidUsersTag
          .map((tag) => tag.user)
          .join(", ")}`,
        404,
      ),
    );
  }

  // check for duplicate tags
  const existingTaggedPosts = await PostTaggedUser.find({
    user: { $in: taggedUserIds },
    post: postId,
  })
    .select("user")
    .lean();

  if (existingTaggedPosts.length > 0) {
    // Identify which user already tagged on the post
    const duplicateUserId = existingTaggedPosts
      .map((val) => val.user)
      .join(", ");

    return next(
      new sendErrorMiddleware(
        `The user(s) with ID(s) ${duplicateUserId} have already been tagged on this post`,
      ),
    );
  }

  // --- CRITICAL PRIVACY CHECK: Do the tagged users follow the post creator? ---

  // We search for documents where the tagged user ID is the 'followers' and
  // the logged-in user ID is the 'following' (meaning the tagged user follows the creator).
  const followersCheck = await Follow.find({
    follower: { $in: taggedUserIds },
    following: loggedInUser,
  })
    .select("follower")
    .lean();

  // store only the followers value into a variable
  const followerUserIds = new Set(followersCheck.map((f) => f.follower));

  // find users who are tagged but do not follow the post creator
  const unauthorizedTags = tags.filter(
    (tag) => !followerUserIds.has(String(tag.user)),
  );

  // check if the unauthorizedTags array greater than 0
  if (unauthorizedTags > 0) {
    // Identify which user is not following the post creator
    const unauthorizedUserIds = unauthorizedTags
      .map((tag) => tag.user)
      .join(", ");

    return next(
      new sendErrorMiddleware(
        `You cannot tag the following user(s) because they do not follow you: ${unauthorizedUserIds}`,
        403,
      ),
    );
  }
  // recreate the tags array by inserting the post id into the tags objects
  const newTags = tags.map((tag) => ({
    post: postId,
    user: tag.user,
    x: tag.x,
    y: tag.y,
  }));

  // create user tagged post
  const taggedPosts = await PostTaggedUser.insertMany(newTags, {
    ordered: false,
  });

  // send a real time notifcation to user, if ii is not the post creator that like is post
  const taggedPostsPromises = taggedPosts.map((taggedPost) => {
    // Only send notification if the tagged user is not the post creator
    if (String(taggedPost.user) !== String(loggedInUser)) {
      return notificationQueue.add(
        {
          receiver: taggedPost.user,
          sender: loggedInUser,
          type: "tag",
          post,
          message: `${loggedInUser} tagged you in a post`,
        },
        {
          priority: 5,
          removeOnComplete: { count: 1000 }, // keep the latest 1000 completed jobs in the queue and remove the rest to prevent the queue from growing indefinitely
          removeOnFail: { age: 24 * 3600 }, // remove the failed jobs after 24 hours to prevent the queue from growing indefinitely
          attempts: 2, // retry the job twice if it fails to process the job, this is useful when there is a temporary error such as network error or database connection error
        },
      );
    }
  });

  // wait for all the notification to be added into the queue
  await Promise.all(taggedPostsPromises);

  // send response to user
  res.status(201).json({
    status: "success",
    data: taggedPosts,
  });
});

// get all the post that user tagged
exports.getAllTaggedPostByUser = catchAsync(async (req, res, next) => {
  // store the logged in user into a variable
  const loggedInUser = req.user.id;

  const taggedPosts = await PostTaggedUser.find()
    .populate({
      path: "post",
      match: { user: loggedInUser },
      populate: { path: "user", select: "_id username photo" },
    })
    .populate({
      path: "user",
      select: "_id username photo",
    })
    .lean();

  // filter out where the post is null
  const newTaggedPosts = taggedPosts.filter((tags) => tags.post !== null);

  // send response to user
  res.status(200).json({
    status: "success",
    results: newTaggedPosts.length,
    data: newTaggedPosts,
  });
});

// get a single user tagged post
exports.getSingleTaggedPostByUser = catchAsync(async (req, res, next) => {
  // get the tagged post id from the user by destructuring req.params
  const { taggedId } = req.params;

  // use the taggedId to get the user tagged post
  const taggedPost = await PostTaggedUser.findById(taggedId).populate("post");

  // check if the tagged post exist
  if (!taggedPost) {
    return next(
      new sendErrorMiddleware(
        "This tagged post does not exist or has been deleted",
        404,
      ),
    );
  }

  // send response to the user
  res.status(200).json({
    status: "success",
    data: taggedPost,
  });
});

// update a single tagged post
exports.updateTaggedPostByUser = catchAsync(async (req, res, next) => {
  // get the tagged id from user by destructuring req.params
  const { taggedId } = req.params;

  // get the x and y coordinates from the user by destructuring req.body
  const { x, y } = req.body;

  // use the taggedId to get the user tagged post from database
  const updateTaggedPost = await PostTaggedUser.findByIdAndUpdate(
    taggedId,
    { x, y },
    { new: true, runValidators: true },
  );

  // check if the tagged post exist
  if (!updateTaggedPost) {
    return next(
      new sendErrorMiddleware(
        "This tagged post has been deleted or not exist",
        404,
      ),
    );
  }

  // send the response to user
  res.status(200).json({
    status: "success",
    data: updateTaggedPost,
  });
});

// delete a tagged post
exports.deleteTaggedPostByUser = catchAsync(async (req, res, next) => {
  // get the tagged post id from the user by destructuring req.params
  const { taggedId } = req.params;

  // use the tagged post id to get the user tagged post from database
  const taggedPost = await PostTaggedUser.findByIdAndDelete(taggedId);

  // check if the tagged post exist
  if (!taggedPost) {
    return next(
      new sendErrorMiddleware(
        "This tagged post cannot be found or has been deleted",
        404,
      ),
    );
  }

  // send response to the user
  res.status(204).json({
    status: "success",
    data: null,
  });
});
