const mongoose = require("mongoose");

const UserHomePost = require("../Models/userHomePostModel");
const Follow = require("../Models/followModel");

// Define the maximum number of posts to keep in the feed array.
// This is critical for preventing the document size from exceeding
// MongoDB's 16MB BSON limit for individual documents.
const MAX_POSTS_IN_HOME_PAGE = 500;

const userHomePostJob = async (job) => {
  try {
    // destructure the job data
    const { postId, userId } = job.data;

    // convert both postId and userId to ObjectId
    const postObjectId = mongoose.Types.ObjectId.createFromHexString(postId);
    const userObjectId = mongoose.Types.ObjectId.createFromHexString(userId);

    console.log(
      `[User Home post] Starting worker for Post ID: ${postId} by Author: ${userId}`,
    );

    // find all followers of the user
    const followerDocuments = await Follow.find({
      following: userObjectId,
    }).select("follower");

    // extract follower IDs and convert to string array
    const followerIds = followerDocuments.map((doc) => doc.follower.toString());

    // include the author's own feed
    const allRecipientIds = [...followerIds, userId.toString()];

    // Ensure that all the recipient are unique and convert recipient IDs back to ObjectId
    const uniqueRecipientObjectIds = [...new Set(allRecipientIds)].map((id) =>
      mongoose.Types.ObjectId.createFromHexString(id),
    );

    // prepare bulk operations
    const bulkOperations = uniqueRecipientObjectIds.map((recipientId) => ({
      updateOne: {
        filter: { user: recipientId },
        update: {
          $push: {
            posts: {
              $each: [postObjectId],
              $position: 0,
              // Slice the array to maintain only the latest MAX_POSTS_IN_HOME_PAGE posts
              $slice: MAX_POSTS_IN_HOME_PAGE,
            },
          },
        },
        // Upsert ensures the UserFeed document is created if it doesn't already exist.
        upsert: true,
      },
    }));

    // execute bulkWrite operation
    const bulkWriteResult = await UserHomePost.bulkWrite(bulkOperations);

    console.log(
      `[User Home post] Successfully updated feeds for Post ID: ${postId}. Result: `,
      bulkWriteResult,
    );

    return {
      status: "completed",
      recipientsCount: uniqueRecipientObjectIds.length,
      modifiedCount: bulkWriteResult.modifiedCount,
      upsertedCount: bulkWriteResult.upsertedCount,
      postId: postId,
    };
  } catch (err) {
    console.log("[User Home post] Error processing job:", err);
    throw err;
  }
};

module.exports = userHomePostJob;
