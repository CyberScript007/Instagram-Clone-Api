const { Queue } = require("bullmq");
const redisConfig = require("../Utils/redisConfig");

const notificationQueue = new Queue("notification", {
  connection: redisConfig,
});

module.exports = notificationQueue;
