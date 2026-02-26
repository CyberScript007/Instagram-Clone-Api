const { Queue } = require("bullmq");
const redisConfig = require("../Utils/redisConfig");

// create a story queue to handle story related background jobs
const storyQueue = new Queue("storyQueue", {
  connection: redisConfig,
});

module.exports = storyQueue;
