// Function to check if the post is created and saved by the user to send different response to the user
const sendDifferentResponse = ({
  res,
  statusCode = 200,
  isPostCreator,
  saved,
  message,
}) => {
  // if the post is created and saved by the user, we don't want to display the modal and collections list in User Interface
  if (isPostCreator) {
    return res.status(statusCode).json({
      status: "success",
      saved,
      isShowCollectionList: false,
      isShowModal: false,
      message,
    });
  }

  // but if the post is not created by the user, we want to display both the modal and collections list in User Interface
  return res.status(statusCode).json({
    status: "success",
    isShowCollectionList: true,
    isShowModal: true,
    saved,
    message,
  });
};

module.exports = sendDifferentResponse;
