const mongoose = require("mongoose");

const Post = require("../../Models/Post/postModel");
const PostComments = require("../../Models/Post/PostComment/postCommentModel");
const PostCommentReply = require("../../Models/Post/PostCommentReply/postCommentReplyModel");
const User = require("../../Models/userModel");
const ReportModel = require("../../Models/Report/ReportModel");

const reportService = require("../../services/Report/reportService");

const moderationQueue = require("../../Utils/moderationQueue");
const redisClient = require("../../Utils/redisClient");
const ApiFeatures = require("../../Utils/ApiFeatures");
const Email = require("../../Utils/email");
const contentModelFunc = require("../../Utils/contentModel");
const contentModelPopulateFunc = require("../../Utils/contentModelPopulate");
const catchAsync = require("../../Utils/catchAsync");
const sendErrorMiddleware = require("../../Utils/sendErrorMiddleware");
const Message = require("../../Models/Conversation/messageModel");

const REPORT_EXPIRED_TIME = 5 * 60 * 1000;
const MAX_REQUESTS = 5;

exports.rateLimitReport = catchAsync(async (req, res, next) => {
  // create uniques key for logged in user
  const reportRedisKey = `rateLimit:${req.user.id}`;

  // get the current timestamp in milliseconds
  const currentTime = Date.now();

  // Start a Redis transaction for atomicity:
  // 1. Remove old requests (timestamps outside the window)
  // 2. Add the current request's timestamp
  // 3. Get the current count of requests within the window
  // 4. Set an expiration on the Redis key for cleanup

  const transactionResult = await redisClient
    .multi()
    .zRemRangeByScore(reportRedisKey, 0, currentTime - REPORT_EXPIRED_TIME) // Remove old timestamps
    .zAdd(reportRedisKey, [
      { score: currentTime, value: currentTime.toString() },
    ]) // Add current timestamp (score & member)
    .zCard(reportRedisKey) // Get current count
    .expire(reportRedisKey, Math.ceil(REPORT_EXPIRED_TIME / 1000) + 60) // Expire key after window + buffer
    .exec();

  // The result from .exec() for ioredis is an array of [error, result] for each command.
  // We need the result from the zcard command, which is the 3rd command (index 2)
  const currentRequestCount = transactionResult[2][1];

  if (currentRequestCount > MAX_REQUESTS) {
    return next(
      new sendErrorMiddleware(
        `Too many reports from this account. Please try again after ${Math.ceil(
          REPORT_EXPIRED_TIME / (1000 * 60),
        )} minutes.`,
        429,
      ),
    );
  }

  next(); // Proceed to the next middleware/route handler
});

exports.createReportLogic = catchAsync(async (req, res, next) => {
  // store the logged in user id into a variable
  const loggedInUser = req.user._id;

  // Destructure the request body
  const { contentType, reason, description, reportedContent } = req.body;

  // convert reportedContent string into mongoose ObjectId
  const reportedContentObject =
    mongoose.Types.ObjectId.createFromHexString(reportedContent);

  // store the content into a  variable
  let content;

  // store reported user into a variable
  let reportedUser;

  // check if the content id exists
  switch (contentType) {
    case "post":
      content = await Post.findById(reportedContent);
      if (!content) {
        return next(new sendErrorMiddleware("Post not found", 404));
      }
      reportedUser = content.user; // Get the user who posted the post
      break;

    case "comment":
      content = await PostComments.findById(reportedContent);
      if (!content) {
        return next(new sendErrorMiddleware("Comment not found", 404));
      }
      reportedUser = content.user; // Get the user who posted the comment
      break;

    case "reply":
      content = await PostCommentReply.findById(reportedContent);
      if (!content) {
        return next(new sendErrorMiddleware("Comment reply not found", 404));
      }
      reportedUser = content.user; // Get the user who posted the comment reply
      break;

    case "message":
      content = await Message.findById(reportedContent);
      if (!content) {
        return next(new sendErrorMiddleware("Message not found", 404));
      }
      reportedUser = content.sender;
      break;

    case "user":
      content = await User.findById(reportedContent);
      if (!content) {
        return next(new sendErrorMiddleware("User not found", 404));
      }
      reportedUser = content._id; // Get the user who is being reported
      break;

    default:
      return next(new sendErrorMiddleware("Invalid content type", 400));
  }

  // check if the content is already reported by the user
  const existingReport = await ReportModel.findOne({
    reporter: loggedInUser,
    reportedContent,
    contentType,
    reason,
    status: { $in: ["pending", "under_review", "escalated"] },
  });

  if (existingReport) {
    return next(
      new sendErrorMiddleware(
        `You have already reported this ${contentType} for '${reason}' and it is currently under review.`,
        409,
      ),
    );
  }

  // let user not report their own content
  if (
    contentType !== "user" &&
    reportedUser &&
    reportedUser._id.toString() === loggedInUser.toString()
  ) {
    return next(
      new sendErrorMiddleware(
        `You cannot report your own ${contentType}.`,
        403,
      ),
    );
  }

  // let prevent user from reporting content that is already hidden
  if (contentType !== "user" && content.isHidden) {
    return next(
      new sendErrorMiddleware(
        `You cannot report this ${contentType} as it is already hidden.`,
        403,
      ),
    );
  }

  // let prevent the user from reporting a content that the owner has been suspended or deleted
  if (
    reportedUser?.accountStatus === "suspended" ||
    reportedUser?.accountStatus === "deleted"
  ) {
    return next(
      new sendErrorMiddleware(
        `You cannot report this ${contentType} as the owner has been suspended or deleted.`,
        403,
      ),
    );
  }

  // let user not report their own profile
  if (
    contentType === "user" &&
    content._id.toString() === loggedInUser.toString()
  ) {
    return next(
      new sendErrorMiddleware("You cannot report your own profile.", 403),
    );
  }

  // create a new report document
  const report = await reportService.createReport({
    reporter: loggedInUser,
    reportedContent: reportedContentObject,
    contentType,
    reason,
    description,
    reportedUser: reportedUser._id,
  });

  res.status(201).json({
    status: "success",
    report,
    message: `You have successfully reported this ${contentType} for '${reason}'.`,
  });
});

// get all reports
exports.getAllReports = catchAsync(async (req, res, next) => {
  // use ApiFeature to filter, sort, paginate and limit the reports
  const features = new ApiFeatures(
    req.query,
    ReportModel.find()
      .populate("reporter", "name username photo email accountStatus")
      .populate("reportedUser", "name username photo email accountStatus"),
  )
    .filter()
    .sort()
    .limitFields()
    .pagination();

  // get all reports
  const reports = await features.query;

  // send all reports as response
  res.status(200).json({
    status: "success",
    results: reports.length,
    data: reports,
  });
});

// get a single report by ID
exports.getSingleReport = catchAsync(async (req, res, next) => {
  // get the report by ID
  let report = await ReportModel.findById(req.params.id)
    .populate("reporter", "name username photo email accountStatus")
    .populate("reportedUser", "name username photo email accountStatus")
    .lean();

  // check if the report exists
  if (!report) {
    return next(new sendErrorMiddleware("Report not found", 404));
  }

  // dynamically populate the reported content based on contentType
  const { contentModel, populateField } = await contentModelPopulateFunc(
    report.contentType,
  );

  // Populate the reported content
  if (contentModel) {
    let contentQuery = await contentModel.findById(report.reportedContent);

    // check if the report content type is user and select both the warnings and banHistory fields
    if (report.contentType === "user") {
      contentQuery = contentQuery.select("+warnings +banHistory");
    }

    // create the reported content details variable
    const reportedContentDetails = await contentQuery.populate(populateField);

    // Add the reported content details to the report object
    report.reportedContentDetails = reportedContentDetails;
  }

  // send the report as response
  res.status(200).json({
    status: "success",
    data: report,
  });
});

// take action on a report
exports.takeActionOnReport = catchAsync(async (req, res, next) => {
  // store the report ID from the request parameters
  const reportId = req.params.id;

  // store the logged in user ID into a variable
  const moderatorId = req.user._id;

  // get the action type from the request body
  const { actionType, reason, durationDays, moderatorNotes } = req.body;

  // check if the action type or reason is provided
  if (!actionType || !reason) {
    return next(
      new sendErrorMiddleware("Action type and reason are required", 400),
    );
  }

  // start a transaction to ensure atomicity
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // get the report by ID
    const report = await ReportModel.findById(reportId).populate(
      "reportedUser",
      "name username photo email accountStatus",
    );

    // check if the report exists
    if (!report) {
      return next(new sendErrorMiddleware("Report not found", 404));
    }

    // check if the report is already resolved
    if (report.status !== "pending" && report.status !== "under_review") {
      return next(
        new sendErrorMiddleware("This report has already been resolved", 400),
      );
    }

    // store the reported user into user to notify variable
    const userToNotify = report.reportedUser;

    // get the content model based on the content type of the report
    const contentModel = await contentModelFunc(report.contentType);

    // check if the content exists
    const reportedContent = await contentModel.findById(report.reportedContent);

    if (!reportedContent) {
      return next(new sendErrorMiddleware("Reported content not found", 404));
    }

    // implement the action based on the action type
    switch (actionType) {
      // hide content globally
      case "hide_content":
        // check if the content type is  user
        if (report.contentType === "user") {
          return next(
            new sendErrorMiddleware(
              "You cannot hide a user profile. Use 'ban_user' action instead.",
              400,
            ),
          );
        }

        // check if the content has already been hidden
        if (reportedContent.isHidden) {
          return next(
            new sendErrorMiddleware("Content is already hidden", 400),
          );
        }

        const contentUpdated = await contentModel.findByIdAndUpdate(
          reportedContent._id,
          { isHidden: true },
          {
            new: true,
            runValidators: true,
            session,
          },
        );

        // send an email notification to the user
        await new Email(userToNotify).sendContentHidden(report);
        break;

      // send a warning message to the user
      case "warn_user":
        // check if the content type is user
        if (report.contentType !== "user") {
          return next(
            new sendErrorMiddleware(
              "You can only warn users, not content.",
              400,
            ),
          );
        }

        // update the user with a warning action
        const userWarning = await User.findByIdAndUpdate(
          userToNotify,
          {
            $push: {
              warnings: {
                reason,
                issuedBy: moderatorId,
                createdAt: new Date(),
              },
            },
          },
          {
            new: true,
            runValidators: true,
            session,
          },
        );

        // send an email notification to the user
        await new Email(userToNotify).sendAccountWarning(report);
        break;

      // ban the user
      case "ban_user":
        // check if the content type is user
        if (report.contentType !== "user") {
          return next(
            new sendErrorMiddleware(
              "You can only ban users, not content.",
              400,
            ),
          );
        }

        // check if the user is already banned
        if (reportedContent.accountStatus === "suspended") {
          return next(
            new sendErrorMiddleware("User is already suspended", 400),
          );
        }

        // define the ban end time
        const bannedEnd = new Date(
          Date.now() + Number(durationDays) * 24 * 60 * 60 * 1000,
        );

        // ban the user logic
        const userBanned = await User.findByIdAndUpdate(
          userToNotify,
          {
            accountStatus: "suspended",
            bannedUntil: bannedEnd, // durationDays in seconds
            $push: {
              banHistory: {
                reason,
                issuedBy: moderatorId,
                createdAt: new Date(),
                bannedUntil: bannedEnd,
              },
            },
          },
          {
            new: true,
            runValidators: true,
            session,
          },
        );

        // send an email notification to the user
        await new Email(userToNotify).sendAccountSuspended(report);

        // calculate the delay for the unban job
        const unbanDelay = bannedEnd.getTime() - Date.now();

        // add the user to job queue to handle further actions like unbanning after the ban duration
        await moderationQueue.add(
          "unban-user",
          {
            userId: userBanned._id,
          },
          {
            delay: unbanDelay, // delay the job until the ban duration has expired
            attempts: 5, // retry the job up to 5 times if it fails, this is useful when there is a temporary error such as network error or database connection error
            backoff: {
              type: "fixed",
              delay: 10000, // fixed delay of 10 seconds before retrying the job if it fails
            },
            jobId: `unban-user-${userBanned._id}-${unbanDelay}`, // unique job ID to prevent duplicate jobs for the same user ban
            removeOnComplete: true, // remove the job from the queue once it is completed to prevent the queue from growing indefinitely
            removeOnFail: { age: Number(durationDays) * 24 * 3600 }, // remove the failed jobs after duration days to prevent the queue from growing indefinitely
          },
        );
        break;

      // soft delete the user account
      case "delete_account":
        // check if the content type is user
        if (report.contentType !== "user") {
          return next(
            new sendErrorMiddleware(
              "You can only delete user accounts, not content.",
              400,
            ),
          );
        }

        // check if the user is already deleted
        if (reportedContent.accountStatus === "deleted") {
          return next(
            new sendErrorMiddleware("User account is already deleted", 400),
          );
        }

        // delete the user account
        const userDeleted = await User.findByIdAndUpdate(
          userToNotify,
          {
            accountStatus: "deleted",
            deletedAt: new Date(),
          },
          {
            new: true,
            runValidators: true,
            session,
          },
        );

        // send an email notification to the user
        await new Email(userToNotify).sendAccountDeleted(report);
        break;

      default:
        return next(new sendErrorMiddleware("Invalid action type", 400));
    }

    // update the report status and action type
    await ReportModel.findByIdAndUpdate(
      reportId,
      {
        status: "resolved",
        actionType,
        reason,
        moderatorNotes,
        resolvedBy: moderatorId,
        resolvedAt: new Date(),
      },
      {
        new: true,
        runValidators: true,
        session,
      },
    );

    // commit the transaction
    await session.commitTransaction();
    session.endSession();

    // send the response
    res.status(200).json({
      status: "success",
      message: `Report has been successfully resolved with action: ${actionType}.`,
    });
  } catch (error) {
    console.log(error);
    // rollback the transaction in case of error
    await session.abortTransaction();
    session.endSession();
    console.error("Error resolving report:", error);
    return next(
      new sendErrorMiddleware(`Error resolving report: ${error}`, 500),
    );
  }
});

// delete a report
exports.deleteReport = catchAsync(async (req, res, next) => {
  // store the report id into a variable
  const reportId = req.params.id;

  // check if the report exist and delete it
  const reportDeleted = await ReportModel.findByIdAndDelete(reportId);

  if (!reportDeleted) {
    return next(
      new sendErrorMiddleware(
        "This report have been deleted or not found",
        404,
      ),
    );
  }

  // send response to user
  res.status(200).json({
    status: "success",
    message: "report successfully deleted",
  });
});
