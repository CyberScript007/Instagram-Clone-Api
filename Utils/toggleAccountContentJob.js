const { default: mongoose } = require("mongoose");
const Post = require("../Models/Post/postModel");
const User = require("../Models/userModel");

/**
 * Handles the transactional content updates for privacy toggle logic.
 * This implements the 24-hour restoration grace period and content reuse restriction.
 */
const toggleAccountContentJob = async (jobData) => {
  // destructure privacyStatus, userId and previousToggleTime from jobData
  const { userId, privacyStatus, previousToggleTime } = jobData;

  // use tranction for atomic content updates
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // check if the privacy status is true
    if (privacyStatus) {
      // all the post created by the userId user not be reuse
      await Post.updateMany(
        { user: userId },
        {
          $set: {
            restrictionFlag: new Date(), // use to restrict all the userId post when the user switch to private account
            isAvailableForReuse: false,
          },
        },
        { session }
      );

      // Note: instagram web app does not support creation of reels and stories, that's why i don't implement the logic to hidden all the reels, stories, remix, posts and templates that use the userId post

      console.log(
        `[WORKER] User ${userId}: All the userId post have restrict and cannot be available for reuse `
      );
    } else {
      const twentyFourHours = 24 * 60 * 60 * 1000;

      // convert the previousToggleTime in milliseconds
      const lastToggleTime = previousToggleTime
        ? previousToggleTime.getTime()
        : 0;

      // subtract the current time in milliseconds from the lastToggleTime
      const timeSinceLastToggle = Date.now() - lastToggleTime;

      // create a filter that will find all the userId content that is restricted and the restrictionFlag should be present in the post document
      const restrictedContentFilter = {
        user: userId,
        restrictionFlag: { $exists: true },
      };

      // if the user switch back to public account before 24 hours, let all is post be reuseable by other user and should be visible to user that are not following the users
      if (timeSinceLastToggle < twentyFourHours) {
        await Post.updateMany(
          restrictedContentFilter,
          {
            $unset: { restrictionFlag: "" }, // remove the deletionnFlag field from all the post document that met the filter requirement
            $set: { isAvailableForReuse: true },
          },
          { session }
        );
      } else {
        // Note: Instagram web app does not support creation of reels, remix, stories and templates, that's i don't implement permanent deletion of the userId post from other users that use it in their content
        // remove the restriction flag field if the user don't switch is account into public acoount, it ensure that all the content derive from the userId post will be permanently deleted
        await Post.updateMany(
          restrictedContentFilter,
          {
            $unset: { restrictionFlag: "" },
          },
          { session }
        );

        console.log(
          `[Worker] User ${userId}: Derivative content from the user post have been permanently deleted and the user post remain unreuse`
        );
      }
    }

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    // update the user privacy change status to ready
    await User.findByIdAndUpdate(
      userId,
      {
        privacyChangeStatus: "ready",
      },
      { new: true, runValidators: true }
    );

    console.log(
      `[WORKER SUCCESS] toggle account content job commited successfully`
    );
  } catch (err) {
    // abort the transaction
    await session.abortTransaction();
    session.endSession();

    console.log("Toggle account content job err: ", err);

    // set the privacy change status to failed if there is error
    await User.findByIdAndUpdate(
      userId,
      {
        privacyChangeStatus: "failed",
      },
      { new: true, runValidators: true }
    );

    // throw the error
    throw err;
  }
};

module.exports = toggleAccountContentJob;
