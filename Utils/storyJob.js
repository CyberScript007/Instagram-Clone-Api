const mongoose = require("mongoose");
const Follow = require("../Models/followModel");
const redisClient = require("../Utils/redisClient");

const storyJob = async (job) => {
  // destructure the job data
  const { storyId, storyCreator, expiresAt, isPopularUser } = job.data;

  // convert expiresAt to milliseconds
  const expiresAtTimestamp = new Date(expiresAt).getTime();

  // convert the storyId into string for Redis
  const storyIdString = storyId.toString();

  try {
    // check if the user follower count is greater than the mega threshold, to check if the user is popular
    if (isPopularUser) {
      // create a mega storyCreator variable
      const megaStoryCreator = `mega_story_user:${storyCreator}`;

      // create an active mega story key for the user
      const activeMegaStoryCreatorKey = `active_mega_story_creators`;

      // create time to live for the mega story creator
      const ttlInSeconds = Math.max(
        0,
        Math.floor((expiresAtTimestamp - Date.now()) / 1000),
      );

      // create a redis pipeline to execute multiple commands
      let pipeline = redisClient.multi();

      // it store the stories of famous users in redis and add the storyCreator to the active mega story creators sorted set with the expiration timestamp as score
      pipeline
        .zAdd(megaStoryCreator, [
          {
            score: expiresAtTimestamp,
            value: storyIdString,
          },
        ])
        // it's store the userId of the active popular users
        .sAdd(activeMegaStoryCreatorKey, storyCreator)
        // set the expiration time for the mega story storyCreator set and add 1 hour to the time to live
        .expireAt(megaStoryCreator, ttlInSeconds + 3600)
        // execute the pipeline
        .exec();

      return { strategy: "pull", status: "completed" };
    } else {
      // create a processed count variable
      let processedCount = 0;

      // create a batch size variable
      const BATCH_SIZE = 1000;

      // get the story creator's followers in batches
      const storyCreatorFollowers = Follow.find({ following: storyCreator })
        .select("follower")
        .lean()
        .cursor({ batchSize: BATCH_SIZE });

      console.log("story creator followers", storyCreatorFollowers);

      // create a redis pipeline to execute multiple commands
      let pipeline = redisClient.multi();

      // iterate through the followers cursor
      for await (const followerDoc of storyCreatorFollowers) {
        const followerId = followerDoc.follower.toString();
        const userStoryFeed = `user_story_feed:${followerId}`;

        // store the active user stories in redis
        const activeRegularStoryCreatorsKey = `active_regular_story_creators:${followerId}`;

        // chain the command to add the storyId to the follower's story feed sorted set with expiration timestamp as score
        pipeline
          .zAdd(userStoryFeed, {
            score: expiresAtTimestamp,
            value: storyIdString,
          })
          // only keep the latest 200 stories in the follower's story feed
          .zRemRangeByRank(userStoryFeed, 0, -201)
          // add the active regular stories key to keep track of users who have active stories
          .zAdd(activeRegularStoryCreatorsKey, [
            {
              score: expiresAtTimestamp,
              value: storyCreator,
            },
          ])
          // set the expiration time for the active regular stories key and add 1 hour to the time to live
          .expireAt(
            activeRegularStoryCreatorsKey,
            Math.floor(expiresAtTimestamp / 1000) + 3600,
          )
          // set the expiration time for the follower's story feed and add 1 hour to the time to live
          .expireAt(
            userStoryFeed,
            Math.floor(expiresAtTimestamp / 1000) + 3600,
          );

        // increase the processed count variable
        processedCount++;

        // Batch execution of pipeline
        if (processedCount % BATCH_SIZE === 0) {
          await pipeline.exec();

          // reset the pipeline for next batch
          pipeline = redisClient.multi();

          // Write a detailed entry into the job's internal log.
          // This acts as a "breadcrumb" for developers to see exactly how many people
          // were reached if they need to debug the job later in the dashboard.
          await job.log(
            `Processed story for ${processedCount} followers out of ${followerCount} total followers.`,
          );
        }
      }

      // check if there are any remaining commands in the pipeline to execute
      if (processedCount % BATCH_SIZE !== 0) {
        await pipeline.exec();
      }
    }
    return { strategy: "push", status: "completed" };
  } catch (err) {
    console.error("Error processing story job:", err);
    throw err;
  }
};

module.exports = storyJob;
