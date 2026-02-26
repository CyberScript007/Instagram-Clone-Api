const jwt = require("jsonwebtoken");
const { promisify } = require("util");

const User = require("../Models/userModel");

const Email = require("../Utils/email");
const redisClient = require("../Utils/redisClient");
const catchAsync = require("../Utils/catchAsync");
const sendErrorMiddleware = require("../Utils/sendErrorMiddleware");
const generateOtp = require("../Utils/generateOtp");

const getToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET_KEY, {
    expiresIn: process.env.JWT_EXPIRED_IN,
  });
};

const createTokenFunc = (res, user, message, statusCode) => {
  const token = getToken(user._id);

  // send token via cookies
  res.cookie("jwt", token, {
    httpOnly: true,
    secure: true,
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRE * 24 * 60 * 60 * 1000
    ),
    sameSite: "None",
  });

  res.status(statusCode).json({
    status: "success",
    token,
    message,
    data: { user },
  });
};

// register new user
exports.signup = catchAsync(async (req, res, next) => {
  // create new user
  const newUser = await User.create({
    username: req.body.username,
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    passwordConfirm: req.body.passwordConfirm,
  });

  // generate otp number
  const otp = generateOtp();
  console.log(otp);
  // console.log(speakeasy.generateSecret().base32);

  // set  otp into database
  newUser.otp = otp;

  // set otpExpires time
  newUser.otpExpiredAt = Date.now() + 5 * 60 * 1000; // expire in next 5 minute

  // save new value for both otp and otpExpiredAt into database and off validation before save
  await newUser.save({ validateBeforeSave: false });

  // send the otp number to the user email
  new Email(newUser).sendOtp(otp);

  res.status(201).json({
    status: "success",
    message:
      "User register successfully, Please verify your otp number to complete your registration",
    data: { newUser },
  });
});

// verify the user with otp number
exports.verifyOtp = catchAsync(async (req, res, next) => {
  // get otp number from user
  const { email, otp } = req.body;

  // get unverify user email from req
  const user = await User.findOne({
    email,
    otpExpiredAt: { $gt: Date.now() },
  });

  // check if the user exist or the otp has not expired
  if (!user) {
    return next(
      new sendErrorMiddleware(
        "The user is not found or the otp number has expired",
        404
      )
    );
  }

  // check if the user otp is equal to the database otp
  if (!(await user.compareUserOtpAndDatabaseOtp(otp, user.otp))) {
    return next(
      new sendErrorMiddleware(
        "otp number is incorrect, please provide a valid otp",
        400
      )
    );
  }

  // remove both otp, isVerified, and otpExpiredAt from database if there is no error
  user.isVerified = true;
  user.otp = undefined;
  user.otpExpiredAt = undefined;

  // set the changes into database
  user.save({ validateBeforeSave: false });

  // send response to user
  createTokenFunc(res, user, "User successfully sign up", 200);
});

exports.resendOtp = catchAsync(async (req, res, next) => {
  // get email from user
  const { email } = req.body;

  // use email to get the value from redis if it exist
  const otpRateLimit = await redisClient.get(`otp_rate_limit:${email}`);

  // if the key exist send error to user to way for one minute before saving another
  if (otpRateLimit) {
    return new sendErrorMiddleware(
      "Too many request, Please wait for 1 minute before regenerate another otp",
      429
    );
  }

  // use the email to get the user from the database
  const user = await User.findOne({ email });

  // check if the user exist
  if (!user) {
    return new sendErrorMiddleware("User does not exist", 404);
  }

  // regenerate otp
  const otp = generateOtp();
  console.log(otp, "otp resend");

  // set isVerified to false
  user.isVerified = false;

  // set new otp to database
  user.otp = otp;

  // set new expire time for otp
  user.otpExpiredAt = Date.now() + 5 * 60 * 1000; // otp expire in the next 5 minutes;

  // set all the changes to the database
  await user.save({ validateBeforeSave: false });

  // set rate limit value in redis and they shoould be allow to set another value after 1 minute
  await redisClient.setEx(`otp_rate_limt:${email}`, 60, "1");

  // set the otp number to the user email
  new Email(user).sendOtp(otp);

  res.status(200).json({
    status: "success",
    message: "Otp number has been sent to your email",
  });
});

// login the user
exports.login = async (req, res, next) => {
  // get user email or username and password
  const { email, username, password } = req.body;

  // check if the user input both email or password
  if ((!email && !username) || !password) {
    return next(
      new sendErrorMiddleware(
        "Please provide your Email or Username and Password",
        400
      )
    );
  }

  // use user email or username to get the user from the database
  const user = await User.findOne({ $or: [{ email }, { username }] }).select(
    "+password"
  );

  // check if the user exist
  if (!user) {
    return next(new sendErrorMiddleware("User does not exist", 404));
  }

  // check if there is user.otp and user.otpExpires fields to make sure the user verify their otp before logging in
  if (!user.isVerified) {
    return next(
      new sendErrorMiddleware(
        "Please verify your otp number before logging in",
        401
      )
    );
  }

  // store the value of comparing both user password and database password in variable
  const isPasswordValid = await user.compareUserPasswordAndDatabasePassword(
    password,
    user.password
  );

  // check if the user password is equal to the database password
  if (!isPasswordValid) {
    return next(
      new sendErrorMiddleware(
        "The email or password does not correct, please provide a valid email or password",
        401
      )
    );
  }

  // check if the user has not been ban
  if (user.accountStatus === "suspended" || user.accountStatus === "deleted") {
    return next(
      new sendErrorMiddleware(
        "Your account have been suspended or deleted, please use our dedicated appeal to submit an appeal",
        403
      )
    );
  }

  // check if the user has not been banned
  if (user.bannedUntil && user.bannedUntil > Date.now()) {
    return next(
      new sendErrorMiddleware(
        `Your account has been banned until ${new Date(
          user.bannedUntil
        ).toLocaleString()}. Please wait until the ban period is over.`,
        403
      )
    );
  }

  // send response to user
  createTokenFunc(res, user, "User successfully log in", 200);
};

// get the jwt token from req.header.authorization in development phase but in production get it from cookies and verify if the cookies is still valid
exports.protectedRoute = catchAsync(async (req, res, next) => {
  // create a variable to assign the token
  let token;

  // check if the req.authourization is true before saving jwt token to the token variable
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }

  // save token get via cookies into token variable
  if (req.cookies.jwt) {
    token = req.cookies.jwt;
  }

  // console.log(req.cookies.jwt);

  // send error message to the users if there is no token
  if (!token) {
    return next(
      new sendErrorMiddleware(
        "You are not logged in, please log in to get access",
        401
      )
    );
  }

  // verify if the json web token is still valid
  const decoded = await promisify(jwt.verify)(
    token,
    process.env.JWT_SECRET_KEY
  );

  // use the json web token id to select the user in database
  const currentUser = await User.findById(decoded.id);

  // check if the user exist
  if (!currentUser) {
    return next(new sendErrorMiddleware("The user does no longer exist", 404));
  }

  // check if the user change is password before accessing the database
  if (currentUser.checkUserPasswordDate(decoded.iat)) {
    return next(
      new sendErrorMiddleware("Please log in with your current password", 401)
    );
  }

  // save the user to the request if there is no error
  req.user = currentUser;
  console.log(req.user);

  // move to the next middleware
  next();
});

// restrict user from some roles
exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    console.log(roles, req.user.role);
    console.log(roles.includes(req.user.role));
    if (!roles.includes(req.user.role)) {
      return next(
        new sendErrorMiddleware(
          "You are not authorized to perform this request",
          403
        )
      );
    }
    next();
  };
};
