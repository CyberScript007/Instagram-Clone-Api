const { Queue } = require("bullmq");
const redisConfig = require("../Utils/redisConfig");

// create a new queue for toggling account privacy
const toggleAccountQueue = new Queue("toggleAccountQueue", {
  connection: redisConfig,
});

module.exports = toggleAccountQueue;
