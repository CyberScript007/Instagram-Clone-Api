const sharp = require("sharp");
const Follow = require("../Models/followModel");
const Story = require("../Models/storyModel");

const catchAsync = require("../Utils/catchAsync");
const sendErrorMiddleware = require("../Utils/sendErrorMiddleware");
const deleteLocalFile = require("../Utils/deleteLocalFile");
const mediaProcessing = require("../Utils/mediaProcessing");

const mediaProcessingQueue = require("../Utils/mediaProcessingQueue");
const storyQueue = require("../Utils/storyQueue");
const redisClient = require("../Utils/redisClient");

exports.resizeImageAndVideoStory = catchAsync(async (req, res, next) => {
  // check if file is present
  if (!req.files && req.files.length === 0) {
    return next(new sendErrorMiddleware("No file uploaded", 400));
  }

  // assign empty array to req.body media
  req.body.media = [];

  // assign empty array to pending jobs variable
  req.body.pendingJobs = [];

  // loop through the files and process them
  const processingPromises = req.files.map(async (file) => {
    // check if the req.file.mimetype is image
    if (file.mimetype.startsWith("image")) {
      // compute the filename
      const filename = `story-${req.user.id}-${Date.now()}.jpeg`;

      // process the image
      await sharp(file.buffer)
        .resize(1080, 1920)
        .toFormat("jpeg")
        .jpeg({ quality: 90 })
        .toFile(`public/img/story/${filename}`);

      // push the filename to req.body.media
      req.body.media.push({
        mediaUrl: `${process.env.DEVELOPMENT_URL}/img/story/${filename}`,
        mediaType: "image",
        processingStatus: "ready",
      });
      // remove uncompressed file from memory
      if (file.path) await deleteLocalFile(file.path);
    } else if (file.mimetype.startsWith("video")) {
      try {
        // get all necessary data from media processing
        const { filename, duration } = await mediaProcessing({
          filePath: file.path,
          destinationDir: "public/video/story",
          isCompressed: false,
          type: "video",
          contentType: "story",
          maxDuration: 60, // 60 seconds
          checkDuration: true,
        });

        // push the necessary data to req.body.media so far the video is still processing
        req.body.media.push({
          mediaUrl: `${filename}`,
          mediaType: "video",
          duration: Math.floor(duration),
          processingStatus: "pending",
        });

        // assign a new pending job to the pending jobs array
        req.body.pendingJobs.push({
          filePath: file.path,
          placeHolderUrl: filename,
        });
      } catch (err) {
        return next(new sendErrorMiddleware(err.message, 400));
      }
    }
  });

  // wait for all the image and video processing promises to complete
  await Promise.all(processingPromises);

  // call the next middleware
  next();
});

exports.createStories = catchAsync(async (req, res, next) => {
  // create a new story
  const storiesPromises = req.body.media.map(async (story) => {
    console.log(story.mediaUrl);
    return await Story.create({
      user: req.user.id,
      mediaUrl: story.mediaUrl,
      mediaType: story.mediaType,
      duration: story.duration,
      processingStatus: story.processingStatus,
      expiresAt: Date.now() + 1 * 60 * 1000, // story expires in 24 hours
    });
  });

  // wait for all the stories to be created
  const stories = await Promise.all(storiesPromises);

  // check if there are any pending jobs to process
  if (req.body.pendingJobs && req.body.pendingJobs.length > 0) {
    // loop through the pending jobs and process the videos
    const pendingJobPromises = req.body.pendingJobs.map((storyJob) => {
      // get story that has the same mediaUrl as the placeholder url and processingStatus is pending
      const story = stories.find(
        (s) =>
          s.mediaUrl === storyJob.placeHolderUrl &&
          s.processingStatus === "pending",
      );

      // check if there is such story and process the video
      if (story) {
        return mediaProcessingQueue.add(
          "process-media",
          {
            filePath: storyJob.filePath,
            contentId: story._id,
            contentType: "story",
            duration: story.duration,
          },
          {
            priority: 1,
            attempts: 3, // retry the job up to 3 times if it fails, this is useful when there is a temporary error such as network error or database connection error
            removeOnComplete: true, // remove the job from the queue when it is completed to prevent the queue from growing indefinitely
            backoff: {
              type: "exponential",
              delay: 5000, // initial delay of 5 seconds before retrying the job if it fails, the delay will increase exponentially for each retry attempt
            },
          },
        );
      }
    });

    // wait for all the pending jobs to be added to the media processing queue
    await Promise.all(pendingJobPromises);
  }

  // add all the new stories to story job queue to process popular users stories or regular users stories
  const storyQueuePromises = stories.map((story) => {
    return storyQueue.add(
      "story",
      {
        storyId: story._id,
        storyCreator: story.user,
        expiresAt: story.expiresAt,
        isPopularUser: req.user.isPopularUser,
      },
      {
        priority: 3,
        attempts: 2, // retry the job twice if it fails to process the job, this is useful when there is a temporary error such as network error or database connection error
        lifo: true, // process the job in LIFO order to make sure the most recent user status change is processed first
        removeOnComplete: true, // remove the job from the queue when it is completed to prevent the queue from growing indefinitely
      },
    );
  });
  // wait for all the new stories to be added to the story queue
  await Promise.all(storyQueuePromises);

  // send a success response
  res.status(201).json({
    status: "success",
    data: {
      stories,
    },
  });
});

// get the logged in user story feed which includes the stories of the users they follow
exports.getFollowedStories = catchAsync(async (req, res, next) => {
  // store the logged in user id into a variable
  const loggedInUserId = req.user.id;

  // store the current time in milleseconds into a variable
  const currentTime = Date.now();

  /***
   * get stories for regular users
   */

  // use the user_story_feed:{userId} key to get the story ids of the stories that should appear in the logged in user's story feed
  const userStoryFeed = `user_story_feed:${loggedInUserId}`;

  // remove all expired stories from the user's story feed
  await redisClient.zRemRangeByScore(userStoryFeed, "-inf", currentTime);

  // store the  active stories into variable
  const regularStoryIds = await redisClient.zRange(userStoryFeed, 0, -1);

  console.log("regular story ids", regularStoryIds);

  const activeMegaStoryCreatorKey = await redisClient.sMembers(
    `active_mega_story_creators`,
  );

  console.log("active mega story creators", activeMegaStoryCreatorKey);

  // mega stories
  // get all the popular users the logged in user is following from redis
  const popularUsersFollowed = await redisClient.sMembers(
    `popular_users_following:${loggedInUserId}`,
  );

  console.log("popular users followed", popularUsersFollowed);

  // create an array to hold mega story ids
  let megaStoryIds = [];

  // check if the popularUsersFollowed array is not empty
  if (popularUsersFollowed.length > 0) {
    // loop through the popular users followed and get their mega stories
    const megaStoriesPromises = popularUsersFollowed.map(
      async (popularUserId) => {
        // create a popular user story key
        const popularUserStoryKey = `mega_story_user:${popularUserId}`;

        // only return the story that hasn't expired from the popular user's story
        return redisClient.zRangeByScore(
          popularUserStoryKey,
          currentTime,
          "+inf",
        );
      },
    );

    // use Promise.all to wait for all the promises to resolve
    const megaStoriesResults = await Promise.all(megaStoriesPromises);

    // flatten the resovled mega stories array and reassign it to megaStoryIds
    megaStoryIds = megaStoriesResults.flat();
    console.log("mega storyId", megaStoryIds);
  }

  // combine both regular stories and mega stories
  const allStoryIds = [...new Set([...regularStoryIds, ...megaStoryIds])];

  // use the story ids to get the stories from the database
  const stories = await Story.find({
    $or: [
      { _id: { $in: allStoryIds } },
      { user: loggedInUserId, expiresAt: { $gt: currentTime } },
    ],
    processingStatus: "ready",
  })
    .populate("user", "name photo username")
    .sort({ createdAt: -1 });

  // Group stories by user
  const storiesByUser = stories.reduce((acc, story) => {
    // store the story creator into a variable
    const creatorId = story.user._id.toString();

    // check if the creatorId already exists in the accumulator
    if (!acc[creatorId]) {
      acc[creatorId] = {
        id: creatorId,
        user: story.user,
        stories: [],
        isSelf: creatorId === loggedInUserId,
        lastUpdated: story.createdAt,
      };
    }

    // push the story into the stories array of the respective user
    acc[creatorId].stories.push(story);

    // update the lastUpdated field if the current story is newer
    if (new Date(story.createdAt) > new Date(acc[creatorId].lastUpdated)) {
      acc[creatorId].lastUpdated = story.createdAt;
    }

    // return the accumulator
    return acc;
  }, {});

  // convert the grouped stories object into an array and sort the logged in user stories first before others users
  const groupedAllStories = Object.values(storiesByUser).sort((a, b) => {
    // check if the logged in user stories is the first story
    if (a.isSelf) return -1;

    // check if the logged in user stories is the second story
    if (b.isSelf) return 1;

    // if the stories are not of the logged in user, sort them by last updated time
    return new Date(b.lastUpdated) - new Date(a.lastUpdated);
  });

  // send the response
  res.status(200).json({
    status: "success",
    results: groupedAllStories.length,
    data: {
      stories: groupedAllStories,
    },
  });
});
