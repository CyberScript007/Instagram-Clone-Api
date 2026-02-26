const { Queue } = require("bullmq");
const redisConfig = require("../Utils/redisConfig");

const userStatusStoryQueue = new Queue("userStatusStoryQueue", {
  connection: redisConfig,
});

module.exports = userStatusStoryQueue;
