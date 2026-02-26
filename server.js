const dotenv = require("dotenv");
const mongoose = require("mongoose");
const socketManager = require("./Utils/socketioServer");

// importing environment variable
dotenv.config({ path: "./config.env" });

const app = require("./app");

// replacing password string with database password
const DB = process.env.DATABASE.replace(
  "<PASSWORD>",
  process.env.DATABASE_PASSWORD
);

// connecting to mongodb cloud database
mongoose.connect(DB).then(() => console.log("DB successfully connected!!!"));

// starting the server
const server = app.listen(process.env.PORT, () => {
  console.log(`App running on port ${process.env.PORT}`);
});

// intialize socket.io server
const io = socketManager.init(server);

// console.log(io);
