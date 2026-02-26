const multer = require("multer");
const path = require("path");
const sendErrorMiddleware = require("../Utils/sendErrorMiddleware");

// --- 1. CONFIGURATION ---

// Define size limits for different file categories
const VIDEO_AUDIO_MAX_SIZE = 25 * 1024 * 1024; // 25MB

// Centralized configuration for disk storage
const DISK_STORAGE_CONFIG = {
  audio: {
    directory: "public/audio/message",
    prefix: "message-audio",
  },
  video: {
    directory: "public/video/message",
    prefix: "message-video",
  },
  document: {
    directory: "public/document/message",
    prefix: "message-document",
  },
};

// Storage for all images (always in memory)
const memoryStorage = multer.memoryStorage();

// --- 2. DISK STORAGE FACTORY ---

/**
 * Creates a reusable Multer DiskStorage instance based on a configuration key.
 * This function eliminates the need for three repetitive diskStorage definitions.
 */
const createDiskStorage = (type) => {
  const config = DISK_STORAGE_CONFIG[type];
  if (!config) {
    throw new Error(`Invalid disk storage type: ${type}`);
  }

  return multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, config.directory);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      // Use req.user.id for authentication/user context
      const filename = `${config.prefix}-${req.user.id}-${Date.now()}${ext}`;
      cb(null, filename);
    },
  });
};

// Pre-create the required disk storage instances (DRY)
const audioDiskStorage = createDiskStorage("audio");
const videoDiskStorage = createDiskStorage("video");
const documentDiskStorage = createDiskStorage("document");

// --- 3. CUSTOM COMBINED STORAGE ---

const customStorage = {
  _handleFile(req, file, cb) {
    let targetStorage;

    if (file.mimetype.startsWith("image")) {
      targetStorage = memoryStorage;
    } else if (file.mimetype.startsWith("audio")) {
      targetStorage = audioDiskStorage;
    } else if (file.mimetype.startsWith("video")) {
      targetStorage = videoDiskStorage;
    } else if (
      file.mimetype.startsWith("application") ||
      file.mimetype.startsWith("text")
    ) {
      targetStorage = documentDiskStorage;
    } else {
      // If the file passed the filter but isn't handled here, reject.
      return cb(
        new sendErrorMiddleware(
          "File handler error: unsupported MIME type.",
          400
        )
      );
    }

    // Delegate the file handling to the determined storage engine
    targetStorage._handleFile(req, file, cb);
  },

  _removeFile(req, file, cb) {
    let targetStorage;

    if (file.mimetype.startsWith("image")) {
      targetStorage = memoryStorage;
    } else if (file.mimetype.startsWith("audio")) {
      targetStorage = audioDiskStorage;
    } else if (file.mimetype.startsWith("video")) {
      targetStorage = videoDiskStorage;
    } else if (
      file.mimetype.startsWith("application") ||
      file.mimetype.startsWith("text")
    ) {
      targetStorage = documentDiskStorage;
    } else {
      return cb(null); // Nothing to remove
    }

    // Delegate the file removal
    targetStorage._removeFile(req, file, cb);
  },
};

// --- 4. MULTER FILTER ---

const multerFilter = (req, file, cb) => {
  if (
    file.mimetype.startsWith("image") ||
    file.mimetype.startsWith("audio") ||
    file.mimetype.startsWith("video") ||
    file.mimetype.startsWith("application") ||
    file.mimetype.startsWith("text")
  ) {
    cb(null, true);
  } else {
    cb(
      new sendErrorMiddleware(
        "This file is not supported, you can only upload images, audio, videos, or documents",
        400
      ),
      false
    );
  }
};

// --- 5. MULTER CONFIGURATION ---

// NOTE: Multer's 'limits' option handles size checks efficiently.
// We configure it to accept the largest possible file size (VIDEO_AUDIO_MAX_SIZE).
// Granular file size checks must be handled after the file is received, if required,
// but for maximum limits, this is the standard approach.

const uploadMessage = multer({
  storage: customStorage,
  fileFilter: multerFilter,
  limits: {
    // Set the overall maximum limit to the highest allowed size (25MB)
    // Multer will automatically reject files larger than this early in the stream.
    fileSize: VIDEO_AUDIO_MAX_SIZE,
  },
});

module.exports = uploadMessage;
