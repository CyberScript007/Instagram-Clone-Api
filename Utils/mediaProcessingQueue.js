const { Queue } = require("bullmq");
const redisConfig = require("../Utils/redisConfig");

const mediaProcessingQueue = new Queue("mediaProcessingQueue", {
  connection: redisConfig,
});

module.exports = mediaProcessingQueue;
