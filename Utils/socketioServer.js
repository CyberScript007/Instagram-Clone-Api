const { createClient } = require("redis");
const redisClient = require("../Utils/redisClient");
const NotificationInstagram = require("../Models/NotificationModel");

let io;

module.exports = {
  init: async (server) => {
    io = require("socket.io")(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST", "PATCH", "DELETE"],
      },
    });

    // create subscriber client
    const subscriber = createClient({
      url: process.env.REDIS_URL,
    });

    // Log error message if subscriber encounter on
    subscriber.on("error", (err) =>
      console.error("Subscriber encounter an error: ", err)
    );

    // connect the subscriber client
    await subscriber
      .connect()
      .then(() => console.log("subscriber successfully connected"))
      .catch((err) =>
        console.error("subscriber encounter error when connecting: ", err)
      );

    // subscribe to notification
    await subscriber.subscribe("notification", async (message, channel) => {
      // convert the message into an object
      const notification = JSON.parse(message);

      // store the notification reciever into a variable
      const notificationReceiver = notification.receiver;

      // use the notification receiver to get the online user from redis
      const userOnline = await redisClient.get(
        `activeUser:${notificationReceiver.id}`
      );

      // check if the user is online before sending the notification data to the user
      if (userOnline) {
        // Emit notification to specific user room via SOCKET.IO
        io.to(notification.receiver).emit("new-notification", notification);
      }
    });

    io.on("connection", (socket) => {
      console.log(`User connected successfully ${socket.id}`);

      socket.on("join", async (userID) => {
        console.log(`This user ${userID} has joined a room`);

        socket.join(userID);

        // store the connected userID and socket.id on redis
        await redisClient.setEx(`activeUser:${userID}`, 86400, socket.id);

        // use the user id pass in, to get all the user notification from database
        const offlineNotifications = await NotificationInstagram.find({
          receiver: userID,
          isRead: false,
        })
          .sort({ createdAt: -1 })
          .populate("sender", "username photo")
          .populate("receiver", "username photo")
          .populate("post", "media caption");

        // loop through the offline notification to emit it through socket.io to the user
        offlineNotifications.forEach((notification) => {
          io.to(userID).emit("new-notification", notification);
        });
      });

      socket.on("disconnect", async (socket) => {
        console.log("Socket disconnect successfully");

        // get all the keys that start with activeUser from redis
        const keys = await redisClient.keys("activeUser:*");

        // loop through the keys to get a userId that is equals to the disconnected socket.id
        for (const key of keys) {
          // store the value of the key into a variable
          const val = await redisClient.get(key);

          // check if the socket.id store into redis is equals to the socket.id of the disconnected socket
          if (val === socket.id) {
            // the delete the key from redis
            await redisClient.del(key);
          }
        }
      });
    });

    return io;
  },

  getIO: () => {
    if (!io) {
      throw new Error("Socket.io is not intialized");
    }

    console.log(io);

    return io;
  },
};
