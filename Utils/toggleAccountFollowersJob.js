const { default: mongoose } = require("mongoose");
const FollowRequest = require("../Models/followRequestModel");
const Follow = require("../Models/followModel");
const User = require("../Models/userModel");

// this function accepts follow requests automatically when the user account is toggled to public
const toggleAccountJob = async (jobData) => {
  // start a mongoose session for transaction to make sure all follow requests are accpeted successfully
  const session = await mongoose.startSession();
  session.startTransaction();

  // destructure the job data to get the user id
  const { userId } = jobData;

  try {
    // get all the pending follow requests for the logged in user
    const pendingFollowRequests = await FollowRequest.find({
      privateUser: userId,
    }).session(session);

    // if the pending follow request length is 0, then there is nothing to process and return
    if (pendingFollowRequests.length === 0) return;

    // create new array from the pending follow requests, which will contain the followers and following field. it will be use to create follow documents
    const newFollows = pendingFollowRequests.map((request) => ({
      follower: request.requestedUser,
      following: request.privateUser,
    }));

    // use the newFollows array to create bulk follow documents
    await Follow.insertMany(newFollows, { ordered: false, session });

    // delete all the follow requests of the logged in user that have been accepted
    await FollowRequest.deleteMany({ privateUser: userId }).session(session);

    // create an array that will consist of all the user ids that have been accepted to follow the logged in user
    const acceptedFollowerIds = pendingFollowRequests.map(
      (request) => request.requestedUser,
    );

    // store the number of accepted followers
    const numberOfRequests = acceptedFollowerIds.length;

    // update the followingCount of the accepted followers
    await User.updateMany(
      { _id: { $in: acceptedFollowerIds } },
      { $inc: { followingCount: 1 } },
    ).session(session);

    // update the followerCount of the logged in user
    await User.findByIdAndUpdate(
      userId,
      {
        $inc: { followerCount: numberOfRequests },
      },
      { new: true, runValidators: true },
    ).session(session);

    console.log(
      `[WORKER SUCCESS - TRANSACTION COMMITTED] Accepted and processed ${numberOfRequests} requests for user ${userId}.`,
    );

    // commit the transaction
    await session.commitTransaction();
    session.endSession();
  } catch (err) {
    // abort the transaction in case there is any error
    await session.abortTransaction();
    session.endSession();

    console.log(
      `[WORKER FAILURE - TRANSACTION ABORTED] Failed to process public switch cleanup for user ${userId}:`,
      err,
    );

    throw err;
  }
};

module.exports = toggleAccountJob;
