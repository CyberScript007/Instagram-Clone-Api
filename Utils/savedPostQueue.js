const { Queue } = require("bullmq");
const redisConfig = require("../Utils/redisConfig");

// create a queue using bull to be able to update the cachePost backgroundly
const savedPostQueue = new Queue("savedPostQueue", {
  connection: redisConfig,
});

module.exports = savedPostQueue;
