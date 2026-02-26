const { createClient } = require("redis");

// Create redis publisher client
const publisher = createClient({
  url: process.env.REDIS_URL,
});

// send error message to user if publisher encounter an error when publishing a message
publisher.on("error", (err) => console.error("Redis publisher error ", err));

// connect the redis publisher
publisher
  .connect()
  .then(() =>
    console.log("Publisher successfully broadcast message to channel")
  )
  .catch((err) =>
    console.log(
      "Publisher encounter an error when broadcasting message to channel"
    )
  );

// publish the data into the specify channel
const publishNotification = async (channel, data) => {
  try {
    await publisher.publish(channel, JSON.stringify(data));
  } catch (err) {
    console.log("Publisher error: ", err);
  }
};

module.exports = publishNotification;
