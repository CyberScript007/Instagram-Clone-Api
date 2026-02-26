const mongoose = require("mongoose");

const Appeal = require("../Models/appealModel");
const User = require("../Models/userModel");
const Post = require("../Models/Post/postModel");

const catchAsync = require("../Utils/catchAsync");
const Email = require("../Utils/email");
const sendErrorMiddleware = require("../Utils/sendErrorMiddleware");
const PostComments = require("../Models/Post/PostComment/postCommentModel");
const PostCommentReply = require("../Models/Post/PostCommentReply/postCommentReplyModel");
const contentModelFunc = require("../Utils/contentModel");
const ApiFeatures = require("../Utils/ApiFeatures");
const contentModelPopulateFunc = require("../Utils/contentModelPopulate");

exports.submitContentAppeal = catchAsync(async (req, res, next) => {
  // store the logged in user id
  const loggedInUser = req.user._id;

  // destructure the request body
  const { reportedContentId, contentType, userReason, originalAction } =
    req.body;

  // check if the content type is equal to user
  if (
    contentType === "user" ||
    originalAction === "ban_user" ||
    originalAction === "delete_account"
  ) {
    return next(
      new sendErrorMiddleware(
        "Please make use of our submit account appeal route, you cannot submit appeal for a user using this route ",
        400,
      ),
    );
  }

  // let create the content model base on the content type
  let contentModel;

  switch (contentType) {
    case "post":
      contentModel = Post;
      break;

    case "comment":
      contentModel = PostComments;
      break;

    case "reply":
      contentModel = PostCommentReply;
      break;

    default:
      return next(new sendErrorMiddleware("Invalid content type"));
  }

  // use the content model to fetch the content
  const content = await contentModel.findById(reportedContentId);

  // let check if the content still exist
  if (!content) {
    return next(
      new sendErrorMiddleware(`The ${contentType} is not found`, 404),
    );
  }

  // check if the user that is appeal is the owner of the content
  if (loggedInUser.toString() !== content.user._id.toString()) {
    return next(
      new sendErrorMiddleware(
        `You are not the owner of the ${contentType}`,
        400,
      ),
    );
  }

  // create the user to be notify
  const userToNotify = content.user;

  // check if the appeal already exist
  const existingAppeal = await Appeal.findOne({
    user: loggedInUser,
    reportedContentId,
    contentType,
    userReason,
    status: { $in: ["pending", "accepted", "rejected"] },
  });

  // if the appeal already exist return an error
  if (existingAppeal) {
    return next(
      new sendErrorMiddleware(
        "You have already submitted an appeal for this content",
        400,
      ),
    );
  }

  // create a new appeal
  const newAppeal = await Appeal.create({
    user: loggedInUser,
    reportedContentId,
    contentType,
    userReason,
    originalAction,
  });

  // send an email to the user notifying them that their appeal has been submitted
  await new Email(userToNotify).sendAppealSubmitted();

  // send response to user
  res.status(201).json({
    status: "success",
    message: "Appeal submitted successfully",
    data: { newAppeal },
  });
});

// create account appeal
exports.submitAccountAppeal = catchAsync(async (req, res, next) => {
  // destructeure the request body
  const { email, username, userReason } = req.body;

  // find user by their email or username
  const user = await User.findOne({ $or: [{ email }, { username }] });

  // check if the user exist
  if (!user) {
    return next(new sendErrorMiddleware("User not found ", 404));
  }

  // check if the user account status is not suspended or deleted
  const accountStatusArray = ["suspended", "deleted"];

  if (!accountStatusArray.includes(user.accountStatus)) {
    return next(
      new sendErrorMiddleware("You account is not suspended or deleted"),
    );
  }

  // get the originalAction properties dynamically
  const originalAction =
    user.accountStatus === "suspended" ? "ban_user" : "delete_account";

  // check if the user have already submitted appeal on this accoount
  const existingAccountAppeal = await Appeal.findOne({
    user: user._id,
    contentType: "user",
    status: "pending",
  });

  if (existingAccountAppeal) {
    return next(
      new sendErrorMiddleware(
        "You have already submitted an appeal for this account, Please wait for it to be reviewed",
        400,
      ),
    );
  }

  // submit account appeal
  const newAccountAppeal = await Appeal.create({
    user: user._id,
    reportedContentId: user._id,
    contentType: "user",
    originalAction,
    userReason,
  });

  // send an email to the user notifying them that their appeal has been submitted
  await new Email(user).sendAppealSubmitted();

  // send response to the user
  res.status(201).json({
    status: "success",
    data: { newAccountAppeal },
  });
});

exports.takenActionOnAppeal = catchAsync(async (req, res, next) => {
  // store the appeal id into a variable
  const appealId = req.params.id;

  // store the moderator that taken the action in a variable
  const moderatorId = req.user._id;

  // destructure the request body
  const { decision, moderatorNotes } = req.body;

  // check if the moderator input the decision
  if (!decision || !["accepted", "rejected"].includes(decision)) {
    return next(
      new sendErrorMiddleware(
        "Please provide a valid decision (accepted or rejected)",
        400,
      ),
    );
  }

  // start transaction to ensure atomicity, it means either all operations in a transaction are completed successfully, or none of them are
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // get the appeal documment by id
    const appeal = await Appeal.findById(appealId).session(session);

    // check if appeal exist or if the appeal status is not pending
    if (!appeal || appeal.status !== "pending") {
      return next(
        new sendErrorMiddleware(
          "Apeeal not found or appeal has been resolved",
          404,
        ),
      );
    }

    // declare a variable to store the user to notify after the action is taken on the appeal
    let userToNotify;

    // check if the user that appeal still exist
    userToNotify = await User.findById(appeal.user).session(session);

    if (!userToNotify) {
      return next(
        new sendErrorMiddleware("User submitting the appeal not found", 404),
      );
    }

    // use the decision to reverse the action been taken on the user
    if (decision === "accepted") {
      // get the content model based on the appeal content type
      const contentModel = await contentModelFunc(appeal.contentType);

      // store the appeal reportedContent id into a variable
      const contentId = appeal.reportedContentId;

      // use the contentModel to get the reported content from the databae
      const content = await contentModel.findById(contentId).session(session);

      // check if the content exist
      if (!content) {
        return next(
          new sendErrorMiddleware(
            `The ${appeal.contentType} is not found`,
            404,
          ),
        );
      }

      // get user to notfiy dynamically, the user to notify can
      userToNotify = content.user || content;

      // reconstruct the appeal original action
      const reversalActionType = `un${appeal.originalAction}`;

      // use the reversal action type to reverse action on the content
      switch (reversalActionType) {
        case "unhide_content":
          // check if the content is not hidden
          if (!content.isHidden) {
            return next(
              new sendErrorMiddleware(
                `The ${appeal.contentType} is already visible`,
                400,
              ),
            );
          }

          // update the content
          await contentModel.findByIdAndUpdate(
            contentId,
            { isHidden: false },
            { session, new: true, runValidations: true },
          );

          // send an email notification to the
          new Email(userToNotify).sendContentVisible(appeal);
          break;

        // unban the user
        case "unban_user":
          // check if the moderator want to unban the user not content
          if (
            appeal.contentType !== "user" ||
            content.accountStatus !== "suspended"
          ) {
            return next(
              new sendErrorMiddleware(
                "You can only unban a user not content",
                400,
              ),
            );
          }

          // perform the unban action
          await contentModel.findByIdAndUpdate(
            contentId,
            { accountStatus: "active", bannedUntil: null },
            { session, new: true, runValidators: true },
          );

          // send unban email to the user
          new Email(userToNotify).sendReactivateAccount();
          break;

        // undelete user account
        case "undeleted_account":
          // check if the moderator want undeleted user account or content
          if (
            appeal.contentType !== "user" ||
            content.accountStatus !== "deleted"
          ) {
            return next(
              new sendErrorMiddleware(
                "You can only undeleted user account not user content",
              ),
            );
          }

          // perform action to undeleted user account
          await contentModel.findByIdAndUpdate(
            contentId,
            { accountStatus: "active", deletedAt: null },
            { session, new: true, runValidators: true },
          );

          // send reactivation email to the user
          new Email(userToNotify).sendReactivateAccount();
          break;

        default:
          return next(
            new sendErrorMiddleware("Invalid reversal action type", 400),
          );
      }
    }

    // finalize the appeal record
    appeal.status = decision;
    appeal.resolvedBy = moderatorId;
    appeal.moderatorNotes = moderatorNotes;
    appeal.resolvedAt = new Date();
    await appeal.save({ session });

    // commit the transaction
    await session.commitTransaction();
    session.endSession();

    // send an email to the user notifying them that their appeal has been resolved or rejected
    const email = new Email(userToNotify);

    if (decision === "accepted") {
      email.sendAppealAccepted(appeal);
    } else {
      email.sendAppealRejected(appeal);
    }

    // send response message to user
    res.status(200).json({
      status: "success",
      message: `Appeal has been ${decision} successfully`,
    });
  } catch (error) {
    // abort the transaction
    await session.abortTransaction();
    session.endSession();

    console.log("Error resolving appeal", error);

    // send error globally
    return next(
      new sendErrorMiddleware("Error resolving appeal", error.message),
    );
  }
});

// get all the appeal appealReport
exports.getAllAppealReports = catchAsync(async (req, res, next) => {
  // use ApiFeature to filter, sort, paginate and limit the appeal reports
  const features = new ApiFeatures(
    req.query,
    Appeal.find()
      .populate("user", "name username photo email accountStatus")
      .populate("resolvedBy", "name username photo email accountStatus"),
  )
    .filter()
    .sort()
    .limitFields()
    .pagination();

  // get all appealReports
  const appealReports = await features.query;

  // send all appealReports as response
  res.status(200).json({
    status: "success",
    results: appealReports.length,
    data: appealReports,
  });
});

// get a single appeal report
exports.getSingleAppealReport = catchAsync(async (req, res, next) => {
  // get the appeal report by ID
  const appealReport = await Appeal.findById(req.params.id)
    .populate("user", "name username photo email accountStatus")
    .populate("resolvedBy", "name username photo email accountStatus")
    .lean();

  // check if the appealReport exists
  if (!appealReport) {
    return next(new sendErrorMiddleware("Appeal report not found", 404));
  }

  // dynamically populate the reported content based on contentType
  const { contentModel, populateField } = await contentModelPopulateFunc(
    appealReport.contentType,
  );

  // Populate the reported content
  if (contentModel) {
    const appealReportedContentDetails = await contentModel
      .findById(appealReport.reportedContentId)
      .populate(populateField)
      .lean();

    // Add the reported content details to the appealReport object
    appealReport.appealReportedContentDetails =
      appealReportedContentDetails || null;
  }

  // send the appealReport as response
  res.status(200).json({
    status: "success",
    data: appealReport,
  });
});

// delete a appeal report
exports.deleteAppealReport = catchAsync(async (req, res, next) => {
  // store the appeal report id into a variable
  const appealReportId = req.params.id;

  // check if the appeal report exist and delete it
  const appealReportDeleted = await Appeal.findByIdAndDelete(appealReportId);

  if (!appealReportDeleted) {
    return next(
      new sendErrorMiddleware(
        "This appeal report have been deleted or not found",
        404,
      ),
    );
  }

  // send response to user
  res.status(200).json({
    status: "success",
    message: "Appeal report successfully deleted",
  });
});
