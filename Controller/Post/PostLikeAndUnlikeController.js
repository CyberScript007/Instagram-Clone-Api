const PostLike = require("../../Models/Post/postLikeModel");
const Post = require("../../Models/Post/postModel");
const PostSaved = require("../../Models/Post/postSavedModel");
const ApiFeatures = require("../../Utils/ApiFeatures");
const savedPostQueue = require("../../Utils/savedPostQueue");
const catchAsync = require("../../Utils/catchAsync");
const notificationQueue = require("../../Utils/notificationQueue");
const sendErrorMiddleware = require("../../Utils/sendErrorMiddleware");

exports.toggleLikePost = catchAsync(async (req, res, next) => {
  // get the post id
  const { postId } = req.params;

  // check if the post exist
  const post = await Post.findById(postId);

  if (!post) {
    return next(new sendErrorMiddleware("Post not found", 404));
  }

  // check if the post is hidden
  if (post.isHidden) {
    return next(
      new sendErrorMiddleware(
        "Post is hidden, you cannot like or unlike this post",
        400,
      ),
    );
  }

  // get user that want to like a post from the user logged in
  const loggedInUser = req.user.id;

  // check if the post already like or not
  const postAlreadyLike = await PostLike.findOne({
    user: loggedInUser,
    post: postId,
  });

  if (postAlreadyLike) {
    await PostLike.findOneAndDelete({
      user: loggedInUser,
      post: postId,
    });

    // decrement the likesCount of the post
    await Post.findByIdAndUpdate(
      postId,
      { $inc: { likesCount: -1 } },
      { runValidators: true },
    );

    // use the post id to find if the post has been saved
    const savedPost = await PostSaved.findOne({ post: postId });

    // use the savedPost id to update the post saved added on queue
    await savedPostQueue.add(
      "saved-post",
      {
        savedPostId: savedPost?._id,
        postId,
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

    return res.status(200).json({
      status: "success",
      liked: false,
      message: "Post unlike",
    });
  }
  // create the like action
  await PostLike.create({
    user: loggedInUser,
    post: postId,
  });

  // increment the likesCount of the post
  await Post.findByIdAndUpdate(
    postId,
    { $inc: { likesCount: 1 } },
    { runValidators: true },
  );

  // use the post id to find if the post has been saved
  const savedPosts = await PostSaved.find({ post: postId });

  // update all the post been saved when use like or unlike the post and use optional chaining to check if the post has been saved before
  const savedPostsPromises = savedPosts.map((savedPost) => {
    return savedPostQueue.add(
      "saved-post",
      {
        savedPostId: savedPost?._id,
        postId,
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
  });

  // await for all the post saved to be updated backgroundly when user like or unlike the post
  await Promise.all(savedPostsPromises);

  // send a real time notifcation to user, if ii is not the post creator that like is post
  await notificationQueue.add(
    {
      receiver: post.user._id.toString(),
      sender: loggedInUser,
      type: "like",
      post: postId,
      message: `${loggedInUser} like your post`,
    },
    {
      priority: 5,
      removeOnComplete: { count: 1000 }, // keep the latest 1000 completed jobs in the queue and remove the rest to prevent the queue from growing indefinitely
      removeOnFail: { age: 24 * 3600 }, // remove the failed jobs after 24 hours to prevent the queue from growing indefinitely
      attempts: 2, // retry the job twice if it fails to process the job, this is useful when there is a temporary error such as network error or database connection error
    },
  );

  // send success response to the user
  res.status(201).json({
    status: "success",
    liked: true,
    message: "You successfully like this post",
  });
});

exports.getAllPostLike = catchAsync(async (req, res, next) => {
  // get the post id
  const { postId } = req.params;

  // use the postId to get the post from database and populate the post likes
  const post = await Post.findById(postId);

  // check if the post does not exist
  if (!post) {
    return next(new sendErrorMiddleware("Post not found", 404));
  }

  // check if the post is hidden
  if (post.isHidden) {
    return next(
      new sendErrorMiddleware(
        "Post is hidden, you cannot get likes of this post",
        400,
      ),
    );
  }

  // store all the total likes of a post inside a variable
  const totalLikes = await PostLike.countDocuments({ post: postId });

  // paginate or sort the like model
  const features = new ApiFeatures(
    req.query,
    PostLike.find({ post: postId }).populate({
      path: "user",
      select: "name username photo createdAt accountStatus",
    }),
  )
    .filter()
    .sort()
    .limitFields()
    .pagination();

  // use the features to create the like query
  const like = await features.query;

  // send the response to the user
  res.status(200).json({
    status: "success",
    totalLikes,
    data: like.map((el) => el.user), // only send the user that like the post to the user
  });
});
