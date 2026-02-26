const Post = require("../../Models/Post/postModel");
const AudioExtractedFromVideo = require("../../Models/Audio/reelsAudioModel");

const ApiFeatures = require("../../Utils/ApiFeatures");
const catchAsync = require("../../Utils/catchAsync");
const sendErrorMiddleware = require("../../Utils/sendErrorMiddleware");

exports.getAllPostsAudio = catchAsync(async (req, res, next) => {
  // destructure the req.params.audioId to store the audioId into a variable
  const { audioId } = req.params;

  // use the audioId to get all the post that use this audio
  // Also use the ApiFeatures to let the user to filter, limit field, sorting and pagination
  const features = new ApiFeatures(
    req.query,
    Post.find({
      audioRef: audioId,
      "media.processingStatus": "ready",
    }).select("_id user media postLikeCount postCommentCount")
  )
    .filter()
    .sort()
    .limitFields()
    .pagination();

  // store the result into a variable
  const posts = await features.query;

  // check if there is any post using this audio
  if (!posts || posts.length === 0) {
    return next(
      new sendErrorMiddleware("No posts found using this audio", 404)
    );
  }

  // send response to the user
  res.status(200).json({
    status: "success",
    results: posts.length,
    data: posts,
  });
});

exports.getSinglePostAudio = catchAsync(async (req, res, next) => {
  // destructure the req.params.audioId to store the audioId into a variable
  const { audioId } = req.params;

  // use the audioId to get audio from the database
  const audio = await AudioExtractedFromVideo.findOne({
    _id: audioId,
  }).populate(
    "originalPost",
    "_id media caption postLikeCount postCommentCount"
  );

  // check if there is a post using this audio
  if (!audio) {
    return next(new sendErrorMiddleware("Audio not found", 404));
  }

  // send response to user
  res.status(200).json({
    status: "success",
    data: audio,
  });
});
