const ffmpeg = require("fluent-ffmpeg"); // use for both video and audio processing
const fs = require("fs").promises; // allow us to have access to all file system methods in promises
const fs_stream = require("fs"); // Import standard fs for stream (createReadStream)
const crypto = require("crypto");

const path = require("path");

const formatPathForWeb = require("../Utils/formatPathForWeb");
const redisClient = require("../Utils/redisClient");
const deleteLocalFile = require("./deleteLocalFile");

// set both the ffmpeg and ffprobe binary so that ffmpeg can use it
ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
ffmpeg.setFfprobePath(process.env.FFPROBE_PATH);

// --- CACHING CONFIGURATION ---
const REDIS_TTL_SECONDS = 7 * 24 * 60 * 60; // Cache results for 7 days
// -----------------------------

/**
 * Calculates the standard aspect ratio string based on pixel dimensions.
 * @param {number} width
 * @param {number} height
 * @returns {string} e.g., '1:1', '9:16', '16:9'
 */
const getAspectRatio = (width, height) => {
  // 1. Vertical (Reels format: Height significantly greater than Width)
  if (height > width * 1.2) return "9:16"; // 9:16 is often 1080x1920 pixels, height is 1.77 times width

  // 2. Square (Standard post format: Width approximately equal to Height)
  if (Math.abs(width - height) < width * 0.1) return "1:1"; // 1:1 is often 1080x1080 pixels, width equals height and 10% tolerance for nearly square

  // 3. Horizontal (Landscape or feed video format: Width significantly greater than Height)
  return "16:9"; // 16:9 is often 1920x1080 pixels, width is 1.77 times height
};

/**
 * Calculates the SHA-256 hash of a local file using streams for scalability.
 * This is the ONLY part where we use fs.createReadStream to avoid memory issues
 * with large files, even though the rest of the module uses fs.promises.
 * * @param {string} filePath - Absolute path to the file.
 * @returns {Promise<string>} The calculated file hash.
 */

const calculateFileHash = (filePath) => {
  return new Promise((resolve, reject) => {
    // creating the hash object
    const hash = crypto.createHash("sha256");

    // Use standard fs.createReadStream for streaming
    const stream = fs_stream.createReadStream(filePath);

    // Pipe each of the chunk data into the hash object
    stream.on("data", (chunk) => hash.update(chunk));

    // When the file finished reading, finalizes the hash
    stream.on("end", () => resolve(hash.digest("hex")));

    // Handle any error during the file reading
    stream.on("error", (err) => {
      console.log(`Error calculating hash for ${filePath}:`, err);
      reject(err);
    });
  });
};

/**
 * Processes video and audio files by compressing, generating thumbnails, and extracting audio.
 * Uses modern async/await and robust path handling.
 *
 * @param {object} options
 * @param {string} options.filePath - Local path to the uncompressed media file.
 * @param {string} options.destinationDir - Base directory for storing processed files (e.g., 'public/img/post').
 * @param {'video' | 'audio'} options.type - The type of media being processed.
 * @param {number} [options.maxDuration] - Maximum allowed duration in seconds (for checkDuration).
 * @param {boolean} [options.checkDuration=false] - Flag to enable duration check.
 * @param {boolean} [options.isCompressed=true] - Flag to enable compression/processing. If false, only metadata is returned.
 * @param {boolean} [options.isExtractedAudio=false] - Flag to enable audio extraction from video.
 * @returns {Promise<object>} Object containing processed file details (filename, duration, URLs).
 */
const mediaProcessing = async ({
  filePath,
  destinationDir,
  type,
  maxDuration,
  checkDuration = false,
  isCompressed = true,
  isExtractedAudio = false,
  contentType,
}) => {
  // declare the absolutePath globally
  let absolutePath;
  let fileHash = null;
  try {
    // first check if the file Path exist
    try {
      await fs.access(filePath);
    } catch (err) {
      throw new Error("File path does not exist");
    }

    // convert the file path into an absolute path
    absolutePath = path.resolve(filePath);

    // create a filename for story file only
    const originalFilename = path.basename(absolutePath);

    // get the file name without the extension
    const filenameWithoutExt = path.parse(originalFilename).name;

    // create the filename dynamically
    const filename = fileHash ? fileHash : filenameWithoutExt;

    // Calculate the file hash, this is used for unique naming and cache keys and check if the content type is post before calculating the file hash because we only want to cache the post media file, not the story media file since story only last for 24 hours and we want to save the storage space in redis
    if (contentType === "post" || type === "audio") {
      fileHash = await calculateFileHash(absolutePath);
    }

    // i) check if the isCompressed is true and check if the fileHash exist as a redis key and also check if the contentType is post or if the type is audio.
    if ((isCompressed && contentType === "post") || type === "audio") {
      const cachedResult = await redisClient.get(
        `fileHash:${fileHash}:audio:${isExtractedAudio}`,
      );

      if (cachedResult) {
        console.log(
          `Cached hit for fileHash:${fileHash}. Returning cached data.`,
        );

        // Return the cached metadata and URLs and convert it into an object
        return JSON.parse(cachedResult);
      }
    }

    // create metadata from videoPath
    const metadata = await new Promise((resolve, reject) => {
      // get the metadata use video processing tools
      ffmpeg.ffprobe(absolutePath, (err, metadata) => {
        if (err) {
          reject(
            new Error(
              `There is an error when getting the metadata for this ${err.message}`,
            ),
          );
        }
        // if there is no error send the metadata as response
        resolve(metadata);
      });
    });

    // destruct the metadata to get access to duration and the rest properties
    const { duration } = metadata.format;

    // Only check the video duration when the checkDuration is true
    if (checkDuration && maxDuration && duration > maxDuration) {
      try {
        // delete the uncompressed file from the server
        await deleteLocalFile(absolutePath);

        console.log(
          `Deleted file ${absolutePath} because duration (${Math.round(
            duration,
          )}s) exceeded max (${maxDuration}s)`,
        );
      } catch (err) {
        console.log(err.message, err);
      }
      throw new Error(
        `Video duration (${Math.round(
          duration,
        )}s) exceeds the maximum allowed duration of ${maxDuration} seconds.`,
      );
    }
    // extract video stream from the metadata, we want to use it to get the video resolution such as 1920x720
    const videoStream = metadata.streams.find((s) => s.codec_type === "video");

    // calculate the aspect ratio dynamically
    let aspectRatio = "1:1"; // default aspect ratio
    if (videoStream) {
      aspectRatio = getAspectRatio(videoStream.width, videoStream.height);
    }

    // check if the isCompressed is false, only return duration, aspect ratio and resolution
    if (!isCompressed && type === "video") {
      return {
        filename: absolutePath,
        duration,
        resolution: `${videoStream?.width}x${videoStream?.height}`,
        aspectRatio,
      };
    }

    // create the compressedPath, thumbnailUrl audio extracted from video  variable
    let compressedPath;
    let thumbnailUrl;
    let audioExtractedFromVideoUrl;

    //  check for the type
    switch (type) {
      case "video":
        // configure the video thumbnail directory
        const thumbnailDir = path.join(destinationDir, "thumbnails");

        // join both the thumbnail directory and filename together to create thumbnail url
        thumbnailUrl = path.join(thumbnailDir, `${filename}-thumbnail.jpg`);
        // create the thumbnail directory programmatical
        await fs.mkdir(thumbnailDir, { recursive: true });

        // generate thumbnail for the video automatically
        await new Promise((resolve, reject) => {
          ffmpeg(absolutePath)
            .screenshot({
              filename: `${filename}-thumbnail.jpg`,
              folder: thumbnailDir,
              count: 1,
            })
            .on("end", resolve)
            .on("error", (err) => {
              console.log("thumbnail error", err);
              return reject(
                new Error(
                  "There is an error when generating thumbnail for this video",
                ),
              );
            });
        });

        // create compressed directory for video
        const compressedDir = path.join(destinationDir, "videos");

        // join both the compressed directory with the filename to create the compressed video url
        compressedPath = path.join(compressedDir, `${filename}-compressed.mp4`);

        // create the video compressed directory automatically
        await fs.mkdir(compressedDir, { recursive: true });

        // compressed and resize the video to width of 600px and auto generate the height
        await new Promise((resolve, reject) => {
          ffmpeg(absolutePath)
            .outputOptions([
              "-vf",
              "scale=600:-2", // Resize to width=600px, height auto
              "-c:v",
              "libx264", // Video codec
              "-crf",
              "28", // Compression quality
              "-preset",
              "veryfast", // Faster compression
              "-c:a",
              "aac", // Audio codec
              "-b:a",
              "128k", // Audio bitrate
            ])
            .on("end", resolve)
            .on("error", (err) => {
              console.log(`Video compressing error: ${err}`);
              return reject(
                new Error(
                  `An error occurred when compressing this video ${err.message}`,
                ),
              );
            })
            .save(compressedPath); // save the compressed video into the specified path
        });

        // check if the user only upload a single video
        if (isExtractedAudio) {
          // create audio extracted directory
          const audioExtractedDir = "public/audio/post";

          // join both the directory path and filename together
          let audioExtractedPath = path.join(
            audioExtractedDir,
            `${fileHash}-extracted-audio.mp3`,
          );

          // create the audio extracted from the video programmatical
          await fs.mkdir(audioExtractedDir, { recursive: true });

          // extract the audio and store it on the server
          await new Promise((resolve, reject) => {
            ffmpeg(absolutePath)
              // Use -vn to skip video, -c:a to set audio codec, and -b:a for bitrate
              .outputOptions(["-vn", "-c:a", "libmp3lame", "-b:a", "192k"])
              .on("end", resolve)
              .on("error", (err) => {
                console.log("Audio extraction error", err);
                throw reject(new Error("Error extracting audio from video"));
              })
              .save(audioExtractedPath);
          });

          // set the audio extracted from video url
          audioExtractedFromVideoUrl = audioExtractedPath;
        }
        break;

      // compressed audio file
      case "audio":
        // configure the audio directory directory
        const audioDir = path.join(destinationDir, "audio");

        // join both the audio directory and filename together to create audio url
        compressedPath = path.join(audioDir, `${fileHash}.mp3`);

        // create the audio directory programmatical
        await fs.mkdir(audioDir, { recursive: true });

        await new Promise((resolve, reject) => {
          ffmpeg(absolutePath)
            .audioCodec("libmp3lame") // This specifies the audio codec to use for the output file. libmp3lame is a popular codec for creating MP3 files.
            .audioBitrate("128k") // This sets the quality of the compressed audio. 128k means 128 kilobits per second. A higher number means higher quality and a larger file size
            .format("mp3") // convert the audio to mp3 format
            .on("end", resolve)
            .on("error", (err) => {
              console.error("Audio compression error", err);
              return reject(new Error("Error compressing audio."));
            })
            .save(compressedPath); // save the compressed audio into the compressed path been specified
        });
        break;
      default:
        throw new Error(
          "Invalid file type, you can only compressed video or audio file",
        );
        break;
    }

    // convert the  main compressor path,  the thumbnailUrl, and audioExtractedFromVideoUrl  seperators to forward /
    compressedPath = compressedPath?.replace(/\\/g, "/");
    thumbnailUrl = thumbnailUrl?.replace(/\\/g, "/");
    audioExtractedFromVideoUrl = audioExtractedFromVideoUrl?.replace(
      /\\/g,
      "/",
    );

    // store the return value into an object
    const returnValues = {
      filename: formatPathForWeb(compressedPath),
      duration,
      resolution: `${videoStream?.width}x${videoStream?.height}`,
      thumbnailUrl: formatPathForWeb(thumbnailUrl),
      audioExtractedFromVideoUrl: formatPathForWeb(audioExtractedFromVideoUrl),
      aspectRatio,
      fileHash,
    };

    // checked if the isCompressed is true and convert the returnValues into string before store it into redis
    if (isCompressed) {
      await redisClient.setEx(
        `fileHash:${fileHash}`,
        REDIS_TTL_SECONDS,
        JSON.stringify(returnValues),
      );
      console.log(`Successfully cached result for fileHash: ${fileHash}`);
    }

    // return the returnVales object to the user
    return returnValues;
  } catch (err) {
    console.log("Media processing error", err);
    throw err;
  } finally {
    // only attempt to delete the uncompressed file if isCompressed is true
    if (isCompressed) {
      try {
        // check if the absolutePath still exist before deleting it
        if (absolutePath) {
          await fs.unlink(absolutePath);
          console.log("Uncompressed file successfully deleted");
        }
      } catch (cleanupErr) {
        if (cleanupErr !== "ENOENT") {
          console.log("Failed to delete uncompressed file", cleanupErr);
        }
      }
    }
  }
};

module.exports = mediaProcessing;
