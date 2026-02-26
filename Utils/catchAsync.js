const catchAsync = (fn) => {
  // it will be called by express
  return (req, res, next) => {
    // catching error in async function and send it to error middleware
    fn(req, res, next).catch((err) => next(err));
  };
};

module.exports = catchAsync;
