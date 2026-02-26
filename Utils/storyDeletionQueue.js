const { Queue } = require("bullmq");
const redisConfig = require("../Utils/redisConfig");

const storyDeletionQueue = new Queue("storyDeletionQueue", {
  connection: redisConfig,
});

module.exports = storyDeletionQueue;
