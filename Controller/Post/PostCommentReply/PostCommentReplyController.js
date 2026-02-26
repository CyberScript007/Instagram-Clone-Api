const PostComments = require("../../../Models/Post/PostComment/postCommentModel");
const PostCommentReplyLike = require("../../../Models/Post/PostCommentReply/postCommentReplyLikeModel");
const PostCommentReply = require("../../../Models/Post/PostCommentReply/postCommentReplyModel");
const ApiFeatures = require("../../../Utils/ApiFeatures");
const catchAsync = require("../../../Utils/catchAsync");
const sendErrorMiddleware = require("../../../Utils/sendErrorMiddleware");

exports.createCommentReply = catchAsync(async (req, res, next) => {
  // store the commentId into a variable by destructuring the req.params
  const { commentId } = req.params;

  // store the logged in user id into a variable
  const loggedInUser = req.user._id;

  // check if the post comment exist
  const comment = await PostComments.findById(commentId);

  if (!comment) {
    return next(new sendErrorMiddleware("Post comment not found", 404));
  }

  // check if the post comment is not hidden
  if (comment.isHidden) {
    return next(
      new sendErrorMiddleware(
        "Post comment is hidden, you cannot reply this post comment",
        400
      )
    );
  }

  // create the reply comment fuctionality
  const commentReply = await PostCommentReply.create({
    user: loggedInUser,
    postComment: commentId,
    text: req.body.text,
  });

  // send response to user
  res.status(201).json({
    status: "success",
    data: commentReply,
  });
});

exports.getAllPostCommentReply = catchAsync(async (req, res, next) => {
  // get the logged in user from protected route
  const loggedInUser = req.user._id;

  // store the commentId into a variable by destructuring the req.params
  const { commentId } = req.params;

  // check if the post comment exist
  const comment = await PostComments.findById(commentId);

  if (!comment) {
    return next(new sendErrorMiddleware("Post comment reply not found", 404));
  }

  // check if the post comment is not hidden
  if (comment.isHidden) {
    return next(new sendErrorMiddleware("Post comment is hidden", 400));
  }

  // get all the post comment reply
  const totalPostCommentsReplies = await PostCommentReply.countDocuments({
    postComment: commentId,
  });

  // Use ApiFeatures to paginate, sort, filter and so on
  const features = new ApiFeatures(
    req.query,
    PostCommentReply.find({
      postComment: commentId,
    }).populate({
      path: "postComment",
      populate: {
        path: "post",
        select: "user",
      },
    })
  )
    .filter()
    .sort()
    .limitFields()
    .pagination();

  // store the query into a variable
  // And also convert the mongoose query into a plain javaScript object, to able to use javaScript object or array methods
  const postCommentsRepliesRaw = await features.query.lean();

  // check if the logged in user is the one that created the comment reply
  const postCommentsReplies = await Promise.all(
    postCommentsRepliesRaw.map((postCommentReply) => {
      return {
        ...postCommentReply,
        isCommentCreator:
          String(postCommentReply.user._id) === String(loggedInUser),
        isPostCreator:
          postCommentReply.postComment.post.user._id.toString() ===
          loggedInUser.toString(),
      };
    })
  );

  // send response to the user
  res.status(200).json({
    status: "success",
    totalPostCommentsReplies,
    data: postCommentsReplies,
  });
});

exports.deletePostCommentReply = catchAsync(async (req, res, next) => {
  // store the post comment reply id into a variable by destructuring req.params
  const { commentReplyId } = req.params;

  // check if the post comment reply exist
  const commentReply = await PostCommentReply.findById(commentReplyId);

  if (!commentReply) {
    return next(new sendErrorMiddleware("Post comment reply not found", 404));
  }

  // check if the comment repply is not hidden
  if (commentReply.isHidden) {
    return next(
      new sendErrorMiddleware(
        "Post comment reply is hidden, cannot be deleted",
        400
      )
    );
  }

  // delete all the post comment reply likes
  await PostCommentReplyLike.deleteMany({ postCommentReply: commentReplyId });

  // delete the post comment reply
  await PostCommentReply.findByIdAndDelete(commentReplyId);

  // send response to the user
  res.status(204).json({
    status: "success",
    message: "Post comment reply delete successfully",
  });
});
