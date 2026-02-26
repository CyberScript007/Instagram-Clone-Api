const PostComments = require("../../../Models/Post/PostComment/postCommentModel");
const PostCommentLike = require("../../../Models/Post/PostComment/postCommentLikeModel");
const catchAsync = require("../../../Utils/catchAsync");
const ApiFeatures = require("../../../Utils/ApiFeatures");
const sendErrorMiddleware = require("../../../Utils/sendErrorMiddleware");

exports.toggleLikeComment = catchAsync(async (req, res, next) => {
  // store the comment id into a variable and destructure the id from req.params
  const { commentId } = req.params;

  // store the logged in user id into a variable
  const loggedInUser = req.user.id;

  // check if the comment exist
  const comment = await PostComments.findById(commentId);

  if (!comment) {
    return next(new sendErrorMiddleware("Post comment not found", 404));
  }

  // check if the post comment is not hidden
  if (comment.isHidden) {
    return next(
      new sendErrorMiddleware(
        "Post comment is hidden, you cannot like or unlike the post comment",
        400
      )
    );
  }

  // check if the logged in user have already like the comment
  const alreadyLikeComment = await PostCommentLike.findOne({
    user: loggedInUser,
    postComment: commentId,
  });

  if (alreadyLikeComment) {
    // if the user has liked the comment, unlike it
    await PostCommentLike.findOneAndDelete({
      user: loggedInUser,
      postComment: commentId,
    });

    // send response to user
    res.status(200).json({
      status: "success",
      message: "Comment unlike",
      liked: false,
    });
  } else {
    // if the comment has not been like, like it
    // create the like functionality
    await PostCommentLike.create({
      user: loggedInUser,
      postComment: commentId,
    });

    // send response message to the user
    res.status(201).json({
      status: "success",
      liked: true,
      messsage: "You successfully like this post comment",
    });
  }
});

exports.getAllCommentLikes = catchAsync(async (req, res, next) => {
  // store the commentId into a variable by destructuring the req.params
  const { commentId } = req.params;

  // check if the postComment exist
  const comment = await PostComments.findById(commentId);

  if (!comment) {
    return next(new sendErrorMiddleware("Post comment not found", 404));
  }

  // check if the post comment is not hidden
  if (comment.isHidden) {
    return next(
      new sendErrorMiddleware(
        "Post comment is hidden, you cannot get all the likes of this post comment",
        400
      )
    );
  }

  // get total comment likes
  const totalCommentLikes = await PostCommentLike.countDocuments({
    postComment: commentId,
  });

  // using ApiFeatures to be able to sort, filter, paginate the query
  const features = new ApiFeatures(
    req.query,
    PostCommentLike.find({ postComment: commentId })
  )
    .filter()
    .sort()
    .limitFields()
    .pagination();

  // store the features query into a variable
  const likes = await features.query;

  // send response to user
  res.status(200).json({
    status: "success",
    totalCommentLikes,
    data: likes,
  });
});
