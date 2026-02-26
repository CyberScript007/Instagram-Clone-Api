const User = require("../Models/userModel");
const catchAsync = require("../Utils/catchAsync");
const Email = require("../Utils/email");
const generateOtp = require("../Utils/generateOtp");
const sendErrorMiddleware = require("../Utils/sendErrorMiddleware");

exports.createAdmin = catchAsync(async (req, res, next) => {
  // check if there is an existing admin to be able to use it to create another admin
  if (!req.user || req.user.role !== "admin") {
    return next(
      new sendErrorMiddleware(
        "You are not authorized to create admin account",
        403
      )
    );
  }

  // if there no error create new admin
  const adminUser = await User.create({
    name: req.body.name,
    email: req.body.email,
    username: req.body.username,
    password: req.body.password,
    passwordConfirm: req.body.passwordConfirm,
    role: "admin", // Set the role to moderator or admin
  });

  // generate otp number
  const otp = generateOtp();
  console.log(otp);
  // console.log(speakeasy.generateSecret().base32);

  // set  otp into database
  adminUser.otp = otp;

  // set otpExpires time
  adminUser.otpExpiredAt = Date.now() + 5 * 60 * 1000; // expire in next 5 minute

  // save new value for both otp and otpExpiredAt into database and off validation before save
  await adminUser.save({ validateBeforeSave: false });

  // send the otp number to the user email
  new Email(adminUser, otp).sendOtp();

  res.status(201).json({
    status: "success",
    message:
      "Admin register successfully, Please verify your otp number to complete your registration",
    data: { adminUser },
  });
});
