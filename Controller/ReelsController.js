const Post = require("../Models/Post/postModel");
const ApiFeatures = require("../Utils/ApiFeatures");
const catchAsync = require("../Utils/catchAsync");

exports.getAllReels = catchAsync(async (req, res, next) => {
  // create an initial query, to get all the reels video
  const initialQuery = Post.find({
    isReels: true,
    "media.0.processingStatus": "ready",
    isHidden: false,
  });

  // use ApiFeatures to filter, sort, limit fields and paginate the saved audio
  const features = new ApiFeatures(req.query, initialQuery);

  // saved the features query into a variable
  const reels = await features.query;

  // send response a user
  res.status(200).json({
    status: "success",
    results: reels.length,
    data: { reels },
  });
});
