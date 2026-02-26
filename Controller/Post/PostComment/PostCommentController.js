const PostComments = require("../../../Models/Post/PostComment/postCommentModel");
const Post = require("../../../Models/Post/postModel");
const catchAsync = require("../../../Utils/catchAsync");
const ApiFeatures = require("../../../Utils/ApiFeatures");
const sendErrorMiddleware = require("../../../Utils/sendErrorMiddleware");
const PostCommentLike = require("../../../Models/Post/PostComment/postCommentLikeModel");
const PostCommentReply = require("../../../Models/Post/PostCommentReply/postCommentReplyModel");
const PostCommentReplyLike = require("../../../Models/Post/PostCommentReply/postCommentReplyLikeModel");
const PostSaved = require("../../../Models/Post/postSavedModel");
const savedPostQueue = require("../../../Utils/savedPostQueue");
const User = require("../../../Models/userModel");
const extractMention = require("../../../Utils/extractMention");
const notificationQueue = require("../../../Utils/notificationQueue");

// create a post comment
exports.createComment = catchAsync(async (req, res, next) => {
  // get the post id from req.params
  const { postId } = req.params;

  // get the user that want to comment
  const loggedInUser = req.user._id;

  // check if the post exist before commenting on the post
  const post = await Post.findById(postId);

  if (!post) {
    return next(new sendErrorMiddleware("Post not found", 404));
  }

  // check if the post is not hidden
  if (post.isHidden) {
    return next(
      new sendErrorMiddleware(
        "Post is hidden, you cannot comment on this post",
        400,
      ),
    );
  }

  // get the post from the saved post
  const savedPosts = await PostSaved.find({ post: postId });

  // update the post in post saved collection whenever a new comment is created and use optional chaining to check if the post is saved or not
  const savedPostsPromises = savedPosts.map((savedPost) => {
    return savedPostQueue.add("saved-post", {
      savedPostId: savedPost?._id,
      postId,
    });
  });

  // await for all the savedPost job to be added to the queue
  await Promise.all(savedPostsPromises);

  // create the comment if there is no error
  const comment = await PostComments.create({
    user: loggedInUser,
    post: postId,
    text: req.body.text,
  });

  // increment the commentsCount of the post
  await Post.findByIdAndUpdate(
    postId,
    { $inc: { commentsCount: 1 } },
    { runValidators: true },
  );

  // pass post caption into extractMention function to extract the user username without including the @ character
  const mentions = extractMention(comment.text);

  // check if the mention length is greater 0, then use the mentions array to find all the user by their username from database
  if (mentions?.length > 0) {
    const mentionUsers = await User.find({
      username: { $in: mentions },
    });

    // check if the mentionUsers array is not empty before sending the notification to the users
    if (mentionUsers.length > 0) {
      // for each of the user then send a real time notification to them if other mention them in their caption
      const mentionUsersNotificationPromises = mentionUsers.map(
        (mentionUser) => {
          return notificationQueue.add(
            {
              receiver: mentionUser._id.toString(),
              sender: loggedInUser,
              type: "mention",
              typeMention: "comment",
              post: postId,
              commentText: comment.text,
              message: `${loggedInUser} commented on your post`,
            },
            {
              priority: 5,
              removeOnComplete: { count: 1000 }, // keep the latest 1000 completed jobs in the queue and remove the rest to prevent the queue from growing indefinitely
              removeOnFail: { age: 24 * 3600 }, // remove the failed jobs after 24 hours to prevent the queue from growing indefinitely
              attempts: 2, // retry the job twice if it fails to process the job, this is useful when there is a temporary error such as network error or database connection error
            },
          );
        },
      );

      // await for all the notification job to be added to the queue
      await Promise.all(mentionUsersNotificationPromises);
    }
  } else {
    // send a real time notifcation to user, if it is not the post creator that comment on a post
    await notificationQueue.add(
      {
        receiver: post.user.toString(),
        sender: loggedInUser,
        type: "comment",
        post: postId,
        commentText: comment.text,
        message: `${loggedInUser} commented on your post`,
      },
      {
        priority: 5,
        removeOnComplete: { count: 1000 }, // keep the latest 1000 completed jobs in the queue and remove the rest to prevent the queue from growing indefinitely
        removeOnFail: { age: 24 * 3600 }, // remove the failed jobs after 24 hours to prevent the queue from growing indefinitely
        attempts: 2, // retry the job twice if it fails to process the job, this is useful when there is a temporary error such as network error or database connection error
      },
    );
  }

  // send the comment as response to user
  res.status(201).json({
    status: "success",
    data: comment,
  });
});

exports.getAllPostComments = catchAsync(async (req, res, next) => {
  // get the logged in user from protected route
  const loggedInUser = req.user._id;

  // store the post id into a variable by destructuring the req.params
  const { postId } = req.params;

  // check if the post exist
  const post = await Post.findById(postId);

  if (!post) {
    return next(new sendErrorMiddleware("Post not found", 404));
  }

  // check if the post is not hidden
  if (post.isHidden) {
    return next(
      new sendErrorMiddleware(
        "Post is hidden, you cannot get access the post comments ",
        400,
      ),
    );
  }

  // get the total comment on this post
  const totalComments = await PostComments.countDocuments({ post: postId });

  // Query features such as pagination, sorting, filtering and so on
  const features = new ApiFeatures(
    req.query,
    PostComments.find({ post: postId }).populate({
      path: "post",
      select: "user",
    }),
  )
    .filter()
    .sort()
    .limitFields()
    .pagination();

  // store the query features
  // And also convert the mongoose query into a plain object, to be able to use javaScript object or array method
  const postCommentsRaw = await features.query.lean();

  // before sending the post comments to the check if the comment is created by the logged in user
  const postComments = await Promise.all(
    postCommentsRaw.map(async (postComment) => {
      return {
        ...postComment,
        isCommentCreator: String(postComment.user._id) === String(loggedInUser),
        isPostCreator:
          postComment.post.user._id.toString() === loggedInUser.toString(),
      };
    }),
  );

  // send the response to the user
  res.status(200).json({
    status: "success",
    totalComments,
    data: postComments,
  });
});

exports.deletePostComment = catchAsync(async (req, res, next) => {
  // store the comment id and post id into a variable by destructuring req.params
  const { commentId } = req.params;

  // check if the post comment exist
  const comment = await PostComments.findById(commentId);

  if (!comment) {
    return next(new sendErrorMiddleware("Post comment not found", 404));
  }

  // check if the post comment is not hidden
  if (comment.isHidden) {
    return next(
      new sendErrorMiddleware(
        "Post comment is hidden, you cannot delete the post comment",
        400,
      ),
    );
  }

  // delete all the post comment likes
  await PostCommentLike.deleteMany({ postComment: commentId });

  // get all the post comment replies that reply to this post comment
  const commentReplies = await PostCommentReply.find(
    {
      postComment: commentId,
    },
    "_id",
  ).lean();

  // store only the commentReplies id into an array
  const commentRepliesIds = commentReplies.map((reply) => reply._id);

  // use the commentRepliesIds to delete  all the likes that the commentReplies has
  await PostCommentReplyLike.deleteMany({
    postCommentReply: { $in: commentRepliesIds },
  });

  // delete all the replies that the comment has
  await PostCommentReply.deleteMany({ postComment: commentId });

  // delete the comments
  const postComment = await PostComments.findByIdAndDelete(commentId);

  // use the post id to get all the post been saved by this post id
  const savedPosts = await PostSaved.find({ post: postComment.post });

  // update all the post been saved when a comment on the post is deleted and use optional chaining to check if the post has been saved before
  const savedPostsPromises = savedPosts.map((savedPost) => {
    return savedPostQueue.add("saved-post", {
      savedPostId: savedPost?._id,
      postId: postComment.post,
    });
  });

  // await for all the savedPost job to be added to the queue
  await Promise.all(savedPostsPromises);

  // send response to the user
  res.status(204).json({
    status: "success",
    data: null,
  });
});
