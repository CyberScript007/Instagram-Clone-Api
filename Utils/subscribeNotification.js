const Redis = require("redis");

const subscriber = new Redis();

const subscribeNotification = () => {
  // subscribe to the notification to receive all the message from that channel
  subscriber.subscribe("notification");
};
