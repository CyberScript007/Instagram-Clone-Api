const dotenv = require("dotenv");
const mongoose = require("mongoose");
const { Worker } = require("bullmq");

// importing environment variable
dotenv.config({ path: "./config.env" });

const sendErrorMiddleware = require("./Utils/sendErrorMiddleware");
const redisConfig = require("./Utils/redisConfig.js");

const savedPostJob = require("./Utils/savedPostJob.js");
const mediaProcessingJob = require("./Utils/mediaProcessingJob");
const notificationJob = require("./Utils/notificationJob.js");
const moderationJob = require("./Utils/moderationJob.js");
const userHomePostJob = require("./Utils/userHomePostJob.js");
const toggleAccountContentJob = require("./Utils/toggleAccountContentJob.js");
const toggleAccountFollowersJob = require("./Utils/toggleAccountFollowersJob.js");
const storyJob = require("./Utils/storyJob.js");
const userStatusStoryJob = require("./Utils/userStatusStoryJob.js");
const storyFollowJob = require("./Utils/storyFollowJob.js");

// import all the neccessary model before adding job to the queue
require("./Models/userModel");
require("./Models/Post/postLikeModel");
require("./Models/Post/PostComment/postCommentModel");
require("./Models/Post/PostComment/postCommentLikeModel");

// replacing password string with database password
const DB = process.env.DATABASE.replace(
  "<PASSWORD>",
  process.env.DATABASE_PASSWORD,
);

// connecting to mongodb cloud database
mongoose
  .connect(DB)
  .then(async () => {
    console.log("DB successfully connected!!!");

    console.log("worker is working");

    // start processing the media processing queue
    const mediaProcessingWorker = new Worker(
      "mediaProcessingQueue",
      async (job) => {
        try {
          // pass the job data into mediaProcessingJob to process the media file and check if the job name is process-media
          if (job.name === "process-media") {
            await mediaProcessingJob(job);
          }
        } catch (err) {
          console.log("media processing queue error: ", err);
        }
      },
      {
        connection: redisConfig,
        concurrency: 2,
      },
    );

    // start processing the user home post queue
    const userHomePostWorker = new Worker(
      "userHomePostQueue",
      async (job) => {
        try {
          // pass the job data into userHomePostJob to process the user home post feed update and check if the job name is user-home-post-feed
          if (job.name === "user-home-post-feed") {
            await userHomePostJob(job);
          }
        } catch (err) {
          console.log("user home post queue error: ", err);
        }
      },
      { connection: redisConfig, concurrency: 10 },
    );

    // start processing the story queue
    const storyWorker = new Worker(
      "storyQueue",
      async (job) => {
        try {
          // pass the job data into storyJob to process the story and check if the job name is story
          if (job.name === "story") {
            await storyJob(job);
          }
        } catch (err) {
          console.log("story queue error: ", err);
        }
      },
      { connection: redisConfig, concurrency: 15 },
    );

    // start processing the story follow queue
    const storyFollowWorker = new Worker(
      "storyFollowQueue",
      async (job) => {
        try {
          // pass the job data into storyFollowJob to process the logged in user story feed update when they follow or unfollow another user and check if the job name is story-follow
          if (job.name === "story-follow") {
            await storyFollowJob(job);
          }
        } catch (err) {
          console.log("story follow queue error: ", err);
        }
      },
      { connection: redisConfig, concurrency: 10 },
    );

    // start processing the user status story queue
    const userStatusStoryWorker = new Worker(
      "userStatusStoryQueue",
      async (job) => {
        try {
          // pass the data into userStatusStoryJob to process the user status story upgrade or downgrade and check if the job name is user-status-story
          if (job.name === "user-status-story") {
            await userStatusStoryJob(job);
          }
        } catch (err) {
          console.log("User status story queue error: ", err);
        }
      },
      { connection: redisConfig, concurrency: 25 },
    );

    // start processing the toggle account queue
    const toggleAccountWorker = new Worker(
      "toggleAccountQueue",
      async (job) => {
        try {
          // excute the job base on their name
          switch (job.name) {
            case "toggleAccountFollowers":
              // pass the job data into toggleAccountFollowersJob to accept the follow request automatically when the user account is toggled to public
              await toggleAccountFollowersJob(job);
              break;

            case "toggleAccountContent":
              // pass the job data into toggleAccountContentJob to delete all the derivative posts, reels or stories if the user does not switch is account to public after 24 hours lapse. But if the user switch if account to public before 24hours lapse restore all derivative posts, reels or stories and let the user posts be available for reuse and also restrict the user post, reels, stories.. from being reuse from other user
              await toggleAccountContentJob(job);
              break;

            default:
              console.log(
                `[TOGGLE ACCOUNT QUEUE] Unknown job name received in the queue: ${job.name}`,
              );
              break;
          }
        } catch (err) {
          console.log("Toggle account queue error: ", err);
        }
      },
      { connection: redisConfig, concurrency: 5 },
    );

    // let the savedPostQueue to start updating the post being saved backgroundly
    const savedPostWorker = new Worker(
      "savedPostQueue",
      async (job, done) => {
        try {
          // pass the job data and done parameter into snapshotProcessor to saved the post backgroundly and check is the job name is saved-post
          if (job.name === "saved-post") {
            await savedPostJob(job, done);
          }
        } catch (err) {
          console.log("saved post queue error: ", err);
        }
      },
      { connection: redisConfig, concurrency: 20 },
    );

    // send notification to user backgroundly
    const notificationWorker = new Worker(
      "notificationQueue",
      async (job) => {
        try {
          // pass the job data into notificationJob to process the notification
          await notificationJob(job);
        } catch (err) {
          console.log("notification queue error", err);
        }
      },
      { connection: redisConfig, concurrency: 50 },
    );

    // unbanned user after the time has expired
    const moderationWorker = new Worker(
      "moderationQueue",
      async (job) => {
        try {
          // pass the job data into moderationJob to process the moderation and check if the job name is unban-user
          if (job.name === "unban-user") {
            await moderationJob(job);
          }
        } catch (err) {
          console.log("moderation queue error: ", err);
        }
      },
      { connection: redisConfig, concurrency: 3 },
    );

    // listen to the completed and failed event from the different queue
    mediaProcessingWorker.on("completed", (job) => {
      console.log(`✅ Media processing job completed ${job.id}`);
    });

    mediaProcessingWorker.on("failed", (job, err) => {
      console.log(`❌ Media processing job failed`, err);
    });

    storyWorker.on("completed", (job) => {
      console.log(`✅ Stories processing job completed ${job.id}`);
    });

    storyWorker.on("failed", (job, err) => {
      console.log(`❌ Stories processing job failed`, err);
    });

    storyFollowWorker.on("completed", (job) => {
      console.log(`✅ Stories follow processing job completed ${job.id}`);
    });

    storyFollowWorker.on("failed", (job, err) => {
      console.log(`❌ Stories follow processing job failed`, err);
    });

    userStatusStoryWorker.on("completed", (job) => {
      console.log(`✅ User status story processing job completed ${job.id}`);
    });

    userStatusStoryWorker.on("failed", (job, err) => {
      console.log(`❌ User status story processing job failed`, err);
    });

    userHomePostWorker.on("completed", (job) => {
      console.log(`✅ User home post processing job completed ${job.id}`);
    });

    userHomePostWorker.on("failed", (job, err) => {
      console.log(`❌ User home post processing job failed`, err);
    });

    toggleAccountWorker.on("completed", (job) => {
      console.log(`✅ Toggle account processing job completed ${job.id}`);
    });

    toggleAccountWorker.on("failed", (job, err) => {
      console.log(`❌ Toggle account processing job failed`, err);
    });

    savedPostWorker.on("completed", (job) => {
      console.log(`✅ job completed ${job.id}`);
    });

    savedPostWorker.on("failed", (job, err) => {
      console.log(`❌ job failed`, err);
    });

    notificationWorker.on("completed", (job) => {
      console.log(`✅ Notification job completed ${job.id}`);
    });

    notificationWorker.on("failed", (job, err) => {
      console.log(`❌ Notification job failed`, err);
    });

    moderationWorker.on("completed", (job) => {
      console.log(`✅ Moderation job completed ${job.id}`);
    });

    moderationWorker.on("failed", (job, err) => {
      console.log(`❌ Moderation job failed`, err);
    });
  })
  .catch((err) => {
    new sendErrorMiddleware(err, 404);
    console.log("queue worker database error: ", err);
  });
