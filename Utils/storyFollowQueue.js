const { Queue } = require("bullmq");
const redisConfig = require("../Utils/redisConfig");

// create a story follow queue
const storyFollowQueue = new Queue("storyFollowQueue", {
  connection: redisConfig,
});

module.exports = storyFollowQueue;
