const { Queue } = require("bullmq");
const redisConfig = require("../Utils/redisConfig");

// create a queue using bull to handle moderation tasks
const moderationQueue = new Queue("moderationQueue", {
  connection: redisConfig,
});

module.exports = moderationQueue;
