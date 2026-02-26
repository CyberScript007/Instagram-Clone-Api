const multer = require("multer");
const path = require("path");
const sendErrorMiddleware = require("./sendErrorMiddleware");

const uploadPostsAndStoriesMiddleware = function (type) {
  // store only image file in memeory
  const memoryStorage = multer.memoryStorage();

  // store video on disk
  const diskStorage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, `public/video/${type}`);
    },
    filename: (req, file, cb) => {
      // get the video extension from the original file
      const ext = path.extname(file.originalname);
      const filename = `${type}-${req.user.id}-${Date.now()}${ext}`;
      cb(null, filename);
    },
  });

  // create a custom storage to let the multer to decide automatically which storage should be use
  const storage = {
    _handleFile(req, file, cb) {
      // use the memoryStorage for image file
      if (file.mimetype.startsWith("image")) {
        memoryStorage._handleFile(req, file, cb);
      }

      // use diskStorage for video file
      if (file.mimetype.startsWith("video")) {
        diskStorage._handleFile(req, file, cb);
      }
    },

    // remove both images or videos file from memory or disk if there is an error
    _removeFile(req, file, cb) {
      // use the memoryStorage for image file
      if (file.mimetype.startsWith("image")) {
        memoryStorage._removeFile(req, file, cb);
      }

      // use diskStorage for video file
      if (file.mimetype.startsWith("video")) {
        diskStorage._removeFile(req, file, cb);
      }
    },
  };

  // throw an error if the user try to upload a file that is not image or video
  const multerFilter = (req, file, cb) => {
    // if the file type that startwith image or video don't send any error message
    if (
      file.mimetype.startsWith("image") ||
      file.mimetype.startsWith("video")
    ) {
      cb(null, true);
    } else {
      cb(
        new sendErrorMiddleware(
          "This file is not supported, you can only upload images or videos",
          400
        ),
        false
      );
    }
  };

  // save it to multer
  const uploadPostsandStroiesMiddleware = multer({
    storage,
    fileFilter: multerFilter,
    limits: { fileSize: 50 * 1024 * 1024 }, // limit file to 50mb
  });

  return uploadPostsandStroiesMiddleware;
};

module.exports = uploadPostsAndStoriesMiddleware;
