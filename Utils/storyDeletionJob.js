const path = require("path");
const deleteLocalFile = require("./deleteLocalFile");
const Story = require("../Models/storyModel");
const redisClient = require("./redisClient");

const storyDeletionJob = async (job) => {
  // destructure the job data
  const { storyId, storyCreator, isPopularUser } = job.data;
  try {
    // fetch the story from the database using the storyId
    const storyDeleted = await Story.findByIdAndDelete(storyId);

    // check if the story exist, if not throw an error
    if (!storyDeleted) {
      throw new Error("Story not found");
    }

    // delete the media file base on the media type
    switch (storyDeleted.mediaType) {
      // delete the image file from the local storage if the media type is image.
      case "image":
        // replace the development url with empty string
        const relativeImagePath = storyDeleted.mediaUrl.replace(
          process.env.DEVELOPMENT_URL,
          "",
        );

        // add public path to the image path
        const absoluteImagePath = path.join("public", relativeImagePath);

        // delete the image file
        await deleteLocalFile(absoluteImagePath);
        break;

      // delete the video file from the local storage if the media type is video.
      case "video":
        // replace the development url with empty string
        const relativeVideoPath = storyDeleted.mediaUrl.replace(
          process.env.DEVELOPMENT_URL,
          "",
        );
        const relativeThumbnailPath = storyDeleted.thumbnail.replace(
          process.env.DEVELOPMENT_URL,
          "",
        );

        console.log(relativeVideoPath, "relative video path");
        console.log(relativeThumbnailPath, "relative thumbnail path");

        // add public path to the image path
        const absoluteVideoPath = path.join("public", relativeVideoPath);
        const absoluteThumbnailPath = path.join(
          "public",
          relativeThumbnailPath,
        );

        console.log(absoluteVideoPath, "absoluteVideoPath");
        console.log(absoluteThumbnailPath, "absoluteThumbnail path");
        await deleteLocalFile(absoluteVideoPath);
        await deleteLocalFile(absoluteThumbnailPath);
        break;

      default:
        console.log("Invalid media type");
        throw new Error("Invalid media type");
    }

    // check if the user is popular, then remove the story from the mega story creator set in redis
    if (isPopularUser) {
      // remove the story from the mega story creator set in redis
      await redisClient.zRem(
        `mega_story_user:${storyCreator}`,
        storyId.toString(),
      );
    }

    console.log(`Successfully deleted expired story: ${storyId}`);
  } catch (error) {
    console.error("Error deleting expired story:", error);
    throw error;
  }
};

module.exports = storyDeletionJob;
