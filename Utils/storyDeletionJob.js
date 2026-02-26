const path = require("path");
const deleteLocalFile = require("./deleteLocalFile");

const storyDeletionJob = async (job) => {
  // destructure the job data
  const { storyId, storyCreator, mediaUrl, isPopularUser, mediaType } =
    job.data;
  try {
    // delete the media file base on the media type
    switch(mediaType){
        // delete the image file from the local storage if the media type is image.
        case "image":
            // replace the development url with empty string
            const relativeImagePath = mediaUrl.replace(
              process.env.DEVELOPMENT_URL,
              "",
            );
        
            // add public path to the image path
            const absoluteImagePath = path.join("public", relativeImagePath);
        
            // delete the image file
            await deleteLocalFile(absoluteImagePath);
            break
            
        // delete the video file from the local storage if the media type is video.
        case "video":
            // if the    

    }
    if (mediaType === "image") {
    }

    if (media)
  } catch (error) {}
};

module.exports = storyDeletionJob;
