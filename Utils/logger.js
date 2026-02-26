const winston = require("winston");
const DailyRotateFile = require("winston-daily-rotate-file");

const logger = winston.createLogger({
  level: "info", // log level
  format: winston.format.combine(
    winston.format.timestamp(), // Add timestamp
    winston.format.json() // Log in json format
  ),

  transports: [
    // Log to console for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(), // Add color to console logs
        winston.format.simple() // Simple format for console
      ),
    }),

    // Log errors to a rotating file for production
    new DailyRotateFile({
      filename: "logs/error-%DATE%.log", // Rotating error log file
      datePattern: "YYYY-MM-DD", // Rotate daily
      zippedArchive: true, // Compress old logs
      maxSize: "3m", // create new log file if the existing one has exceed 3mb
      maxFiles: "3d", // delete the old log after 3 days
      level: "error", // only log error into the file
    }),
  ],
});

module.exports = logger;
