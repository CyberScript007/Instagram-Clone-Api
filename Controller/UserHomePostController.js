const Post = require("../Models/Post/postModel");
const UserHomePost = require("../Models/userHomePostModel");
const ApiFeatures = require("../Utils/ApiFeatures");
const catchAsync = require("../Utils/catchAsync");

exports.getUserHomePosts = catchAsync(async (req, res, next) => {
  // store the logged in user id into a variable
  const loggedInUser = req.user.id;

  // get the user home posts by user id
  const userHomePosts = await UserHomePost.findOne({ user: loggedInUser });

  // check if the user home posts is empty and send an empty array as response
  if (!userHomePosts || userHomePosts.posts.length === 0) {
    return res.status(200).json({
      status: "success",
      results: 0,
      data: {
        posts: [],
      },
      message: "Follow users to see posts in your home feed!",
    });
  }

  // create an initail query to get the posts details
  const initialQuery = Post.find({
    _id: { $in: userHomePosts.posts },
    "media.processingStatus": { $ne: "failed" },
    isHidden: false,
  });

  // use the userHomePosts.posts array to get the posts details from the Post model
  const features = new ApiFeatures(req.query, initialQuery)
    .filter()
    .sort()
    .limitFields()
    .pagination();

  // execute the query
  const posts = await features.query;

  // send the response to user
  res.status(200).json({
    status: "success",
    results: posts.length,
    data: {
      posts,
    },
  });
});
