const logger = require("../Utils/logger");
const sendErrorMiddleware = require("../Utils/sendErrorMiddleware");

const handleDuplicateValueDB = (err) => {
  // extract email address from the err.errorResponse.errmsg string
  const errString = err.errorResponse.errmsg.match(/email: \"([^\"]+)\"/)[1];

  // return error message
  return new sendErrorMiddleware(
    `This is email ${errString} has already exist, please use another email`,
    400
  );
};

const handleValidationErrorDB = (err) => {
  // convert err.errors object to array with key and values, loop though the array to generate custom error messages
  const message = Object.entries(err.errors)
    .map(([field, err]) => `${field}: ${err.message}`)
    .join(". ");

  // send custom error message to errorMiddleware
  return new sendErrorMiddleware(message, 400);
};

const handleJWTExpiredError = (err) => {
  // construct an error message and send it to the user
  return new sendErrorMiddleware(
    "Your session has expired, please log in again to get access",
    400
  );
};

const handleCastError = (err) => {
  // send an error message to the user
  return new sendErrorMiddleware(
    `Invalid id ${err.value}, please insert a valid id`,
    404
  );
};

const handleMulterError = (err) => {
  // send an error message to the user
  return new sendErrorMiddleware(
    `${err.message}, you can only upload a file or video that is less or equals to 50mb`,
    400
  );
};

const sendErrorDev = (err, req, res) => {
  // log all development errors into logs file
  logger.error("Development error occur:", {
    message: err.message,
    stack: err.stack,
  });

  // send response to api
  res.status(err.statusCode).json({
    status: err.status,
    message: err.message,
    err,
    stack: err.stack,
  });
};

const sendErrorProd = (err, req, res) => {
  // send production error to log file
  logger.error("Production error occurred:", {
    message: err.message,
    err,
  });

  // send production response to user
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
    });
  }
  // send a static message if the error is unknown
  res.status(err.statusCode).json({
    status: err.status,
    message: "An error occurred while processing your request",
  });
};

const handleAllErrors = (err, req, res, next) => {
  // set default value to err.status and err.statusCode
  err.statusCode = err.statusCode || 500;
  err.status = String(err.statusCode).startsWith("4") ? "fail" : "error";

  // send development error if NODE_ENV is development
  if (process.env.NODE_ENV === "development") {
    sendErrorDev(err, req, res);
  }

  // send production error if NODE_ENV is production
  if (process.env.NODE_ENV === "production") {
    // check if the error code is 11000 for duplicate email
    if (err?.errorResponse?.code === 11000) err = handleDuplicateValueDB(err);

    // check if the err name is ValidationError
    if (err.name === "ValidationError") err = handleValidationErrorDB(err);

    // check if the err name is TokenExpiredError
    if (err.name === "TokenExpiredError") err = handleJWTExpiredError(err);

    // check if the err name is CastError
    if (err.name === "CastError") err = handleCastError(err);

    // check if the err name is MulterError
    if (err.name === "MulterError") err = handleMulterError(err);

    sendErrorProd(err, req, res);
  }
};

module.exports = handleAllErrors;
