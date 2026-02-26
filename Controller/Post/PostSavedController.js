const Post = require("../../Models/Post/postModel");
const PostSaved = require("../../Models/Post/postSavedModel");

const sendDifferentResponse = require("../../Utils/sendDifferentResponse");
const ApiFeatures = require("../../Utils/ApiFeatures");
const redisClient = require("../../Utils/redisClient");
const catchAysnc = require("../../Utils/catchAsync");
const sendErrorMiddleware = require("../../Utils/sendErrorMiddleware");
const savedPostQueue = require("../../Utils/savedPostQueue");
const PostCollection = require("../../Models/Post/PostCollection/PostCollectionModel");
const catchAsync = require("../../Utils/catchAsync");

// extract all the update post save functionalities into a function
const updatePostSavedFunc = async ({
  filter,
  res,
  isPostCreator,
  next,
  redisKey,
  loggedInUser,
  defaultCollection,
  postId,
}) => {
  //  soft delete on the post been saved
  const updatePostSaved = await PostSaved.findOneAndUpdate(
    filter,
    { deleted: true, deletedAt: new Date() },
    {
      new: true,
    },
  );

  if (!updatePostSaved) {
    return next(new sendErrorMiddleware("Post saved not found", 404));
  }

  // delete the redisKey from redis client
  await redisClient.del(redisKey);

  // soft delete the post from all custom collections that the post appear
  await PostSaved.updateMany(
    {
      user: loggedInUser,
      deleted: false,
      postCollection: { $ne: defaultCollection },
    },
    { deleted: true, deletedAt: new Date() },
  );

  // add job to background queue
  await savedPostQueue.add(
    "saved-post",
    {
      savedPostId: updatePostSaved._id,
      postId,
      loggedInUser,
    },
    {
      priority: 4,
      attempts: 3, // retry the job up to 3 times if it fails, this is useful when there is a temporary error such as network error or database connection error
      backoff: {
        type: "fixed",
        delay: 10000, // fixed delay of 10 seconds before retrying the job if it fails
      },
      jobId: `saved-post-update-${loggedInUser}-${postId}`, // unique job ID to prevent duplicate jobs for the same saved post update
      removeOnComplete: true, // remove the job from the queue when it is completed to prevent the queue from growing indefinitely
      removeOnFail: { age: 24 * 3600 }, // remove the failed jobs after 24 hours to prevent the queue from growing indefinitely
    },
  );

  // send different response to user
  return sendDifferentResponse({
    res,
    isPostCreator,
    saved: false,
    message: "Post unsaved",
  });
};

exports.toggleSavedPost = catchAysnc(async (req, res, next) => {
  // get the post id from user
  const { postId } = req.params;

  // also get the forceRemove value from the user
  const { forceRemove } = req.body;

  // store the logged in user into a variable
  const loggedInUser = req.user.id;

  // create redis key
  const redisKey = `saved:${loggedInUser}:${postId}`;

  // pass the redisKey into to get the value
  const isCached = await redisClient.get(redisKey);

  // use the post id to check if the post exist
  const post = await Post.findById(postId);

  if (!post) {
    return next(
      new sendErrorMiddleware(
        "The post you want to save is not found or has been deleted",
        400,
      ),
    );
  }

  // check if the post is not hidden
  if (post.isHidden) {
    return next(
      new sendErrorMiddleware("Post is hidden, you cannot save this post", 400),
    );
  }

  // use the post retrieve to check if is the loggedInUser that created the post
  const isPostCreator = String(post.user._id) === loggedInUser;

  // check if there is default collection for this user
  const defaultCollection = await PostCollection.findOne(
    {
      user: loggedInUser,
      isDefault: true,
    },
    "_id",
  );

  if (!defaultCollection) {
    return next(
      new sendErrorMiddleware("Please create a default post collection", 404),
    );
  }

  // storing the logged in user id, postId and default collection id into an object so that we can avoid duplicate code
  const filter = {
    user: loggedInUser,
    post: postId,
    postCollection: defaultCollection,
  };

  // check if the value been stored inside the redis is equals 1 and if it is the logged in user  that created the post, this show that the post has been saved before and let unsaved the post
  if (isCached === "1" && isPostCreator) {
    // execute the updatePostSavedFunc
    return await updatePostSavedFunc({
      filter,
      res,
      isPostCreator,
      next,
      redisKey,
      loggedInUser,
      defaultCollection,
      postId,
    });
  }

  // check if the value been stored inside the redis is equals 1 and if the post was not created by the logged in user, this show that the post has been saved before and let unsaved the post
  if (isCached === "1" && !isPostCreator) {
    // check if the post was  still saved in custom collection
    const checkPostInCustomCollection = await PostSaved.exists({
      user: loggedInUser,
      post: postId,
      deleted: false,
      postCollection: { $ne: defaultCollection },
    });

    if (checkPostInCustomCollection && !forceRemove) {
      return res.status(200).json({
        status: "success",
        isShowModal: true,
      });
    }

    // execute the updatePostSavedFunc
    return await updatePostSavedFunc({
      filter,
      res,
      isPostCreator,
      next,
      redisKey,
      loggedInUser,
      defaultCollection,
      postId,
    });
  }

  // check the database if the user want to resaved the post
  const alreadyExistPost = await PostSaved.findOne(filter);

  if (alreadyExistPost && alreadyExistPost.deleted) {
    // reset both deleted and deletedAt properties to their default state
    alreadyExistPost.deleted = false;
    alreadyExistPost.deletedAt = null;
    await alreadyExistPost.save();

    // reset the redis value to 1
    await redisClient.set(redisKey, "1");

    // add job to background queue
    await savedPostQueue.add("saved-post", {
      savedPostId: alreadyExistPost._id,
      postId,
      loggedInUser,
    });

    // send different response to user
    return sendDifferentResponse({
      res,
      isPostCreator,
      saved: true,
      message: "Post re-saved",
    });
  }

  // Stale correction: if the user try to saved a post but the post was saved in the database and the deleted is set to false and the redis key has been deleted, which make the redis return null indicating that the post wasn't saved in the database, so we have to force the post to be unsaved in order to correct both the redis and database
  if (alreadyExistPost && alreadyExistPost.deleted === false) {
    return await updatePostSavedFunc({
      filter,
      res,
      isPostCreator,
      next,
      redisKey,
      loggedInUser,
      defaultCollection,
      postId,
    });
  }

  // if the user has not saved the post before
  const savedPost = await PostSaved.create(filter);

  // set the redis value to 1 for the first time the post was saved
  await redisClient.set(redisKey, "1");

  // add job to background queue
  await savedPostQueue.add(
    "saved-post",
    {
      savedPostId: savedPost._id,
      postId,
      loggedInUser,
    },
    {
      priority: 4,
      attempts: 3, // retry the job up to 3 times if it fails, this is useful when there is a temporary error such as network error or database connection error
      backoff: {
        type: "fixed",
        delay: 10000, // fixed delay of 10 seconds before retrying the job if it fails
      },
      jobId: `saved-post-update-${loggedInUser}-${postId}`, // unique job ID to prevent duplicate jobs for the same saved post update
      removeOnComplete: true, // remove the job from the queue when it is completed to prevent the queue from growing indefinitely
      removeOnFail: { age: 24 * 3600 }, // remove the failed jobs after 24 hours to prevent the queue from growing indefinitely
    },
  );

  // send different response to user
  return sendDifferentResponse({
    res,
    isPostCreator,
    saved: true,
    message: "Post saved successfully",
  });
});

exports.getAllSavePost = catchAysnc(async (req, res, next) => {
  // store the logged in user into a variable
  const loggedInUser = req.user.id;

  // save the default collection into a variable to select all the post that are saved with default collection
  const defaultCollection = await PostCollection.findOne(
    { user: loggedInUser, isDefault: true },
    "_id",
  );

  // initialize query with filter for current user
  const initialQuery = PostSaved.find({
    user: loggedInUser,
    postCollection: defaultCollection,
    deleted: false,
  }).populate({ path: "postCollection", select: "name" });

  // pass the initial query into the ApiFeatures
  const features = new ApiFeatures(req.query, initialQuery)
    .filter()
    .sort()
    .limitFields()
    .pagination();

  // saved the features query into a variable
  const savedPost = await features.query.select("cachedPost");

  // send the response to user
  res.status(200).json({
    status: "success",
    results: savedPost.length,
    data: savedPost,
  });
});

// get only one post in the default collection
exports.getSingleSavedPost = catchAsync(async (req, res, next) => {
  // get the post id from the user by destructuring req.params
  const { postId } = req.params;

  // store the logged in user into a variable
  const loggedInUser = req.user._id;

  // check if the post still exist
  const post = await Post.findById(postId);

  if (!post) {
    return next(
      new sendErrorMiddleware(
        "The post you are trying to get from default collection has been deleted or removed",
        404,
      ),
    );
  }

  // check if the post is not hidden
  if (post.isHidden) {
    return next(
      new sendErrorMiddleware(
        "Post is hidden, you cannot get this post from default collection",
        400,
      ),
    );
  }

  // get the user default collection and only select the id
  const defaultCollection = await PostCollection.findOne(
    {
      user: loggedInUser,
      isDefault: true,
    },
    "_id",
  );

  // use the default collection to get the post from PostSaved model
  const savedPost = await PostSaved.findOne({
    user: loggedInUser,
    post: postId,
    postCollection: defaultCollection,
    deleted: false,
  });

  // send an error message to the user if the post has not been saved
  if (!savedPost) {
    return next(new sendErrorMiddleware("This post has not been saved", 400));
  }

  // send the saved post to user
  res.status(200).json({
    status: "success",
    data: savedPost,
  });
});
