const AudioExtractedFromVideo = require("../Models/Audio/reelsAudioModel");
const Post = require("../Models/Post/postModel");
const Story = require("../Models/storyModel");

const mediaProcessing = require("./mediaProcessing");
const stripPublicPath = require("./stripPublicPath");

const mediaProcessingJob = async (job) => {
  // destructure the job data
  const {
    filePath,
    contentId,
    contentType,
    mediaId,
    isExtractedAudio,
    userId,
    username,
  } = job.data;

  console.log(isExtractedAudio, "isExtractedAudio");

  // create a variable to store Model, destination dir, max duration and if extracted audio is needed
  let Model;
  let destinationDir;
  let maxDuration;
  let isAudioExtractionAllowed = false;

  // check the content type and assign the correct values
  switch (contentType) {
    case "post":
      Model = Post;
      destinationDir = "public/video/post";
      maxDuration = 3600; // 1 hour in seconds
      isAudioExtractionAllowed = isExtractedAudio;
      break;

    case "story":
      Model = Story;
      destinationDir = "public/video/story";
      maxDuration = 60; // 60 seconds
      break;
    default:
      throw new Error(`Unsupported content type: ${contentType}`);
  }

  // create audio ref is variable
  let audioRefId = null;

  try {
    console.log("Start processing media processing queue");

    // check if the userId exist
    if (contentType === "post" && !userId) {
      throw new Error(
        "Cannot process post: userId is required for audio ownership.",
      );
    }

    // process the media file
    const {
      filename,
      duration,
      thumbnailUrl,
      aspectRatio,
      audioExtractedFromVideoUrl,
      fileHash,
    } = await mediaProcessing({
      filePath,
      destinationDir,
      isCompressed: true,
      type: "video",
      maxDuration,
      checkDuration: true,
      contentType,
      isExtractedAudio: isAudioExtractionAllowed,
    });

    // remove public path from the filename and thumbnailUrl
    const filenameUrl = stripPublicPath(filename);
    const thumbnailUrlPath = stripPublicPath(thumbnailUrl);

    // remove public path from the audio extracted from the video and check if the audioExtractedFromVideoUrl exist
    const audioExtractedUrlPath = audioExtractedFromVideoUrl
      ? stripPublicPath(audioExtractedFromVideoUrl)
      : null;

    // check if the audio extracted from video is been created before saving it into the database
    if (audioExtractedUrlPath) {
      // Atomic Find-or-Create (Upsert) to prevent creating duplicate audio url
      const newAudioDocument = await AudioExtractedFromVideo.findOneAndUpdate(
        { hash: fileHash }, // Query: Find existing document by unique content hash
        {
          $setOnInsert: {
            // Fields to set only if a new document is created
            url: `${process.env.DEVELOPMENT_URL}${audioExtractedUrlPath}`,
            originalUser: userId,
            originalPost: contentId,
            title: `Original audio - @${username}`,
            duration: Math.floor(duration),
            hash: fileHash,
          },
          // Use $inc to update the count whether the document is inserted or found
          $inc: { usageCount: 1 },
        },
        {
          new: true,
          upsert: true,
          runValidators: true,
          setDefaultsOnInsert: true,
        },
      );

      // assign new audio id to the audio ref id
      audioRefId = newAudioDocument._id;

      console.log(`Successfully created Audio document for post ${contentId}`);
    }

    // construct dynamic update operation
    const fullDuration = Math.floor(duration);
    let updateOperation = { $set: {} };
    let updateQuery;

    if (contentType === "post") {
      // update the query for post content type
      updateQuery = {
        _id: contentId,
        "media._id": mediaId,
      };

      // ceate a update operation variable to be able to insert the audio ref id into the post been updated
      updateOperation.$set = {
        "media.$.url": `${process.env.DEVELOPMENT_URL}${filenameUrl}`,
        "media.$.thumbnail": `${process.env.DEVELOPMENT_URL}${thumbnailUrlPath}`,
        "media.$.extractedAudioUrl": audioExtractedUrlPath
          ? `${process.env.DEVELOPMENT_URL}${audioExtractedUrlPath}`
          : null,
        "media.$.duration": Math.floor(duration), // round off the duration to the nearest whole number
        "media.$.aspectRatio": aspectRatio,
        "media.$.processingStatus": "ready",
        "media.$.fileHash": fileHash,
      };

      // check if the audio ref id exist and insert it into the updateOperation object
      if (audioRefId) {
        updateOperation.$set.audioRef = audioRefId;
      }
    } else if (contentType === "story") {
      // update the query for story content type
      updateQuery = {
        _id: contentId,
      };

      // create an update operation for story
      updateOperation.$set = {
        mediaUrl: `${process.env.DEVELOPMENT_URL}${filenameUrl}`,
        thumbnail: `${process.env.DEVELOPMENT_URL}${thumbnailUrlPath}`,
        duration: fullDuration,
        aspectRatio: aspectRatio,
        processingStatus: "ready",
      };
    } else {
      console.log(`Unsupported content type: ${contentType}`);
      throw new Error(`Unsupported content type: ${contentType}`);
    }

    // update the content document based on the content type
    const updatedDocument = await Model.updateOne(updateQuery, updateOperation);

    // dynamically construct a message
    const message = contentType === "post" ? "media item" : "";

    // check if there was an error updating the document based on modified count
    if (updatedDocument.modifiedCount === 0) {
      console.log(`Error updating the ${contentType} ${message}`);
      throw new Error(
        `There was an error updating the ${contentType} ${message}`,
      );
    }

    console.log(`${contentType} ${message} successfully updated`);
  } catch (err) {
    console.log(
      `Failed to process media for ${contentType} ${contentId}: `,
      err,
    );

    try {
      if (contentType === "post" && mediaId) {
        await Post.updateOne(
          { _id: contentId, "media._id": mediaId },
          {
            $set: { "media.$.processingStatus": "failed" },
          },
        );

        console.error(
          `Post ${contentId} media ${mediaId} status set to failed`,
        );
      } else if (contentType === "story") {
        await Story.updateOne(
          { _id: contentId },
          {
            $set: { processingStatus: "failed" },
          },
        );
        console.error(`Story ${contentId} status set to failed`);
      } else {
        console.error(
          `Cannot update processing status to failed: Unsupported content type ${contentType}`,
        );
      }
    } catch (dbErr) {
      console.error(
        `Critical: Failed to update media processing status to failed:`,
        dbErr,
      );
    }
  }
};

module.exports = mediaProcessingJob;
