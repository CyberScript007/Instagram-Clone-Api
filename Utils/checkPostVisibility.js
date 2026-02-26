const Follow = require("../Models/followModel");
const User = require("../Models/userModel");

/**
 * Checks if a requesting user is authorized to view content from a specific profile owner.
 * ADJUSTED to use the 'isPrivate' field from the User model.
 *
 * @param {string} requestingUserId - The ID of the user trying to view the content.
 * @param {string} profileOwnerId - The ID of the user who owns the content.
 * @returns {Promise<boolean>} - True if the user can view, false otherwise.
 */
const checkPostVisibility = async (loggedInUser, profileOwnerId) => {
  // check if the logged in user is the one viewing is post, return true if the check is true
  const isViewingIsPost = String(loggedInUser) === String(profileOwnerId);

  if (isViewingIsPost) {
    return true;
  }

  // if the logged in user is not the owner of the post then fetch user from the database by is profileOwnerId and check if the user exist, if it does not return false
  const profileOwnerUser = await User.findById(profileOwnerId)
    .select("isPrivate")
    .lean();
  console.log(profileOwnerUser);

  if (!profileOwnerUser) {
    return false;
  }

  // check if the isPrivate is false
  if (profileOwnerUser.isPrivate === false) {
    return true;
  }

  // check if the logged in user is a follower of the profileOwnerUser
  const isFollowing = await Follow.findOne({
    followers: loggedInUser,
    following: profileOwnerId,
  });

  // Use !! to reliably convert the resulting document (or null) into a true/false boolean.
  return !!isFollowing;
};

module.exports = checkPostVisibility;
