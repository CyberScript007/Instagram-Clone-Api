const User = require("../Models/userModel");
const ApiFeatures = require("../Utils/ApiFeatures");
const catchAsync = require("../Utils/catchAsync");
const sendErrorMiddleware = require("../Utils/sendErrorMiddleware");

// get all users
exports.getAllUsers = catchAsync(async (req, res, next) => {
  const features = new ApiFeatures(
    req.query,
    User.find({ accountStatus: "active" })
  )
    .filter()
    .sort()
    .limitFields()
    .pagination();

  // get all users
  const users = await features.query;

  // send all users as response
  res.status(200).json({
    status: "success",
    results: users.length,
    data: { users },
  });
});

exports.getUser = catchAsync(async (req, res, next) => {
  // get user by id
  const user = await User.findById(req.params.id);

  // send error message to global error middleware if the user does not exist
  if (!user) {
    return next(new sendErrorMiddleware("The user does not exist", 404));
  }

  // check if the user is active
  if (user.accountStatus !== "active") {
    return next(new sendErrorMiddleware("The user is not active", 403));
  }

  // check if the user is suspended
  if (user.accountStatus === "suspended") {
    return next(new sendErrorMiddleware("The user is suspended", 403));
  }

  // check if the user is deleted
  if (user.accountStatus === "deleted") {
    return next(new sendErrorMiddleware("The user is deleted", 403));
  }

  // send the response to user
  res.status(200).json({
    status: "success",
    data: { user },
  });
});

exports.createUser = (req, res, next) => {
  res.status(500).json({
    status: "error",
    message: "Please use the /signup routes to create new user.",
  });
};

// update user
exports.updateUser = catchAsync(async (req, res, next) => {
  // get user by id and update their data
  const user = await User.findByIdAndUpdate(req.params.id, req.body, {
    runValidators: true,
    new: true,
  });

  // send error message if there is no user
  if (!user) {
    return next(new sendErrorMiddleware("User not found", 404));
  }

  // send the new data to the user
  res.status(200).json({
    status: "success",
    data: { user },
  });
});

// search user
exports.searchUser = catchAsync(async (req, res, next) => {
  // sanitize the query the user input and also check if the user input a value
  const searchQuery = req.query.q ? req.query.q.trim() : "";

  // check if the searchQuery exist'
  if (!searchQuery) {
    return res.status(200).json({
      status: "success",
      results: 0,
      data: { users: [] },
    });
  }

  // Convert the searchQuery into lowerCase
  const lowerSearchQuery = searchQuery.toLowerCase();

  // get the last character of the search query
  const getLastChar = lowerSearchQuery.slice(-1);

  // remove the last word from the search query
  const removeLastChar = lowerSearchQuery.slice(0, -1);

  // increase the last character to next character
  const nextChar = String.fromCharCode(getLastChar.charCodeAt(0) + 1);

  // concatenate both the removeLastCahr and mextChar to create the next word in which is used to instruct database where to stop searching
  const nextWord = removeLastChar + nextChar;

  // create initial query and use $or operator, so the user can able to search base on username or name
  const initialQuery = User.find({
    $or: [
      {
        username: { $gte: lowerSearchQuery, $lt: nextWord },
      },
      {
        name: { $gte: lowerSearchQuery, $lt: nextWord },
      },
    ],
  })
    .collation({ locale: "en", strength: 2 })
    .select("_id name username photo followerCount");

  // use the ApiFeatures to be able to filter, sort, limitFields and paginate the user
  const features = new ApiFeatures(req.query, initialQuery)
    .filter()
    .sort()
    .limitFields()
    .pagination();

  // store the search users into a variable
  const users = await features.query;

  // send the response to the user
  res.status(200).json({
    status: "success",
    results: users.length,
    data: {
      users,
    },
  });
});

// delete user
exports.deleteUser = catchAsync(async (req, res, next) => {
  // get the user by id and delete user from database
  await User.findByIdAndDelete(req.params.id);

  // send response to user
  res.status(204).json({
    status: "success",
    data: null,
  });
});
