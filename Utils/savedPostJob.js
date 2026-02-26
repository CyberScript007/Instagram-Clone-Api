const Post = require("../Models/Post/postModel");
const PostSaved = require("../Models/Post/postSavedModel");
const redisClient = require("./redisClient");
const sendErrorMiddleware = require("./sendErrorMiddleware");

const savedPostJob = async (job, done) => {
  // destructure the job parameter, get access to the job parameter from bull
  const { savedPostId, postId, loggedInUser, type } = job.data;

  try {
    // set default type to update if the user didn't pass in the type parameter
    const jobType = type || "update";

    // if the type is delete, delete the post saved and mark the job as done
    if (jobType === "delete") {
      // delete the post saved from the document
      await PostSaved.findByIdAndDelete(savedPostId);

      // all clean up redis cache
      await Promise.all([redisClient.del(`saved:${loggedInUser}:${postId}`)]);

      // mark the job as done
      return done();
    }

    // if the jobType is update then update the post saved
    if (jobType === "update") {
      // use the postId to get the post from the database
      const post = await Post.findById(postId);

      // check if the post exist
      if (!post) {
        console.warn("The post is not found or has been deleted");

        // aslo mark the job as done
        return done(new sendErrorMiddleware("Post not found", 404));
      }

      // get the first media of the post
      const firstMedia = post.media[0];

      // create a snapshot object that will be use to update the post that is saved backgroundly
      const snapshot = {
        caption: post.caption,
        hashtags: post.hashtags,
        media: {
          url: firstMedia.url,
          mediaType: firstMedia.mediaType,
          thumbnail:
            firstMedia.mediaType === "video" ? firstMedia.thumbnail : null,
        },
        hideLikes: post.hideLikes,
        hideComment: post.hideComment,
        isSponsored: post.isSponsored,
        postLikeCount: post.likesCount,
        postCommentCount: post.commentsCount,
        user: {
          id: post.user._id,
          name: post.user.name,
          username: post.user.username,
          photo: post.user.photo,
        },
        createdAt: post.createdAt,
      };

      // update the post saved backgroundly when the particular post is saved or modify
      await PostSaved.findByIdAndUpdate(savedPostId, { cachedPost: snapshot });
    }
  } catch (err) {
    console.log("Error in savedPostJob: ", err);
    throw err;
  }
};

module.exports = savedPostJob;
