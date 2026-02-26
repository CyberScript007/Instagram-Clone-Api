const User = require("../Models/userModel");
const Email = require("./email");

const moderationJob = async (job) => {
  console.log("start user ban moderation queue");
  try {
    // destructure the job data
    const { userId } = job.data;

    // check if the user exist
    const user = await User.findById(userId);

    if (!user) {
      console.log("User not found");
      return;
    }

    // check if the user is suspended and bannedUntil is less than the current date
    if (user.accountStatus === "suspended") {
      // update the user account status to active
      user.accountStatus = "active";
      user.bannedUntil = null;
      await user.save({ validateBeforeSave: false });

      console.log(`${user.username} has been  successfully unbanned`);

      // send an email to the user notifying them that they have been unbanned
      await new Email(user).sendReactivateAccount();
    }
  } catch (err) {
    console.log("moderation job error", err);
    throw err;
  }
};

module.exports = moderationJob;
