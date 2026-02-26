const PostCommentReplyLike = require("../../../Models/Post/PostCommentReply/postCommentReplyLikeModel");
const PostCommentReply = require("../../../Models/Post/PostCommentReply/postCommentReplyModel");
const ApiFeatures = require("../../../Utils/ApiFeatures");
const catchAsync = require("../../../Utils/catchAsync");
const sendErrorMiddleware = require("../../../Utils/sendErrorMiddleware");

exports.toggleCommentReplyLike = catchAsync(async (req, res, next) => {
  // store the commentReply id into a variable by destructuring the req.params
  const { commentReplyId } = req.params;

  // store the logged in user into a variable
  const loggedInUser = req.user.id;

  // check if the replyComment exist
  const commentReply = await PostCommentReply.findById(commentReplyId);

  if (!commentReply) {
    return next(new sendErrorMiddleware("Post comment reply not found", 404));
  }

  // check if the post comment reply is not hidden
  if (commentReply.isHidden) {
    return next(
      new sendErrorMiddleware(
        `Post comment reply is hidden, you cannot like this post comment reply`,
        400
      )
    );
  }

  // check if the user has liked the comment reply before
  const alreadyLikedCommentReply = await PostCommentReplyLike.findOne({
    user: loggedInUser,
    postCommentReply: commentReplyId,
  });

  if (alreadyLikedCommentReply) {
    await PostCommentReplyLike.findOneAndDelete({
      user: loggedInUser,
      postCommentReply: commentReplyId,
    });

    res.status(200).json({
      status: "success",
      liked: false,
      message: "Comment reply unlike",
    });
  } else {
    await PostCommentReplyLike.create({
      user: loggedInUser,
      postCommentReply: commentReplyId,
    });

    res.status(201).json({
      status: "success",
      liked: true,
      message: "Comment reply liked successfully",
    });
  }
});

exports.getAllCommentReplyLike = catchAsync(async (req, res, next) => {
  // store the comment reply id into a variable by destructuring req.params
  const { commentReplyId } = req.params;

  // check if the post comment relpy exist
  const commentReply = await PostCommentReply.findById(commentReplyId);

  if (!commentReply) {
    return next(new sendErrorMiddleware("Post comment reply not found", 404));
  }

  // check if the post comment reply is not hidden
  if (commentReply.isHidden) {
    return next(new sendErrorMiddleware("Post comment reply is hidden", 400));
  }

  // get all total comment reply like
  const totalPostCommentReplyLike = await PostCommentReplyLike.countDocuments({
    postCommentReply: commentReplyId,
  });

  // Use ApiFeatures to paginate, sort, filter and so on
  const features = new ApiFeatures(
    req.query,
    PostCommentReplyLike.find({ postCommentReply: commentReplyId })
  )
    .filter()
    .sort()
    .limitFields()
    .pagination();

  // store the query into a variable
  const postCommentReplyLike = await features.query;

  // send the response to the user
  res.status(200).json({
    status: "success",
    totalPostCommentReplyLike,
    data: postCommentReplyLike,
  });
});
