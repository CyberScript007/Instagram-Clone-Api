const { createClient } = require("redis");

// creating redis client
const redisClient = createClient({
  url: process.env.REDIS_URL,
});

// checking if there is error in creating redis client
redisClient.on("error", (err) => console.log(`Redis error ${err}`));

// connecting redis to local server
redisClient
  .connect()
  .then(() => console.log("redis successfully connected"))
  .catch((err) => console.log(`Redis failed to connect: ${err}`));

module.exports = redisClient;
