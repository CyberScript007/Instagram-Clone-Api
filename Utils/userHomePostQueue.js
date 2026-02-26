const { Queue } = require("bullmq");
const redisConfig = require("../Utils/redisConfig");

const userHomePostQueue = new Queue("userHomePostQueue", {
  connection: redisConfig,
});

module.exports = userHomePostQueue;
