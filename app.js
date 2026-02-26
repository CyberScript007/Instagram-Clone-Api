const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const path = require("path");
const cookieParser = require("cookie-parser");

const adminRoutes = require("./routes/adminRoutes");
const userRoutes = require("./routes/userRoutes");
const postRoutes = require("./routes/Post/postRoutes");
const postCommentRoutes = require("./routes/Post/PostComment/postCommentRoutes");
const postCollectionRoutes = require("./routes/Post/PostCollection/postCollectionRoutes");
const PostTaggedUserRoutes = require("./routes/Post/PostTaggedUser/PostTaggedUserRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const reportRoutes = require("./routes/Report/reportRoutes");
const appealRoutes = require("./routes/appealRoutes");
const conversationRoutes = require("./routes/Conversation/coversationRoutes");
const messageRoutes = require("./routes/Conversation/messageRoutes");
const exploreRoutes = require("./routes/exploreRoutes");
const reelsAudioRoutes = require("./routes/Audio/reelsAudioRoutes");
const reelsRoutes = require("./routes/reelsRoutes");
const storyRoutes = require("./routes/storyRoutes");
const userHomePostRoutes = require("./routes/userHomePostRoutes");
const suggestionRoutes = require("./routes/suggestionRoutes");

const handleAllErrors = require("./Controller/errorMiddleware");
const sendErrorMiddleware = require("./Utils/sendErrorMiddleware");

const app = express();

// initiate cookie-parser to be able to retrieve cookies value
app.use(cookieParser());

// initiate express to be able to retrieve res.body value
app.use(express.json());

// get access to the public folder
app.use(express.static(path.join(__dirname, "public")));

// initialize morgan middleware for development level
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
}

// cors options
const corsOption = {
  origin: ["http://localhost:1234", "https://socketio-tester.netlify.app"], // Allow both localhost and 127.0.0.1
  credentials: true, // Allow cookies/session tokens
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], // Explicitly allow OPTIONS
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOption));

// connect api url to app url
app.use("/api/v1/create-admin", adminRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/posts", postRoutes);
app.use("/api/v1/comments", postCommentRoutes);
app.use("/api/v1/collections", postCollectionRoutes);
app.use("/api/v1/reports", reportRoutes);
app.use("/api/v1/appeals", appealRoutes);
app.use("/api/v1/notifications", notificationRoutes);
app.use("/api/v1/conversations", conversationRoutes);
app.use("/api/v1/messages", messageRoutes);
app.use("/api/v1/explores", exploreRoutes);
app.use("/api/v1/audios", reelsAudioRoutes);
app.use("/api/v1/reels", reelsRoutes);
app.use("/api/v1/stories", storyRoutes);
app.use("/api/v1/feed", userHomePostRoutes);
app.use("/api/v1/suggestions", suggestionRoutes);

// app.use("/api/v1/tagged", PostTaggedUserRoutes);

// send error to global error middleware is the route the user want to access is not found
app.use("*", (req, res, next) => {
  return next(
    new sendErrorMiddleware(
      `The url ${req.originalUrl} is not found, Please use a valid url`,
      404,
    ),
  );
});

// centralize all the error in the applicayion in one place
app.use(handleAllErrors);

module.exports = app;
