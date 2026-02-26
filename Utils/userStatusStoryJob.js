const Story = require("../Models/storyModel");
const Follow = require("../Models/followModel");
const redisClient = require("./redisClient");

const userStatusStoryJob = async (job) => {
  // destructure the job data
  const { storyCreator, status } = job.data;

  // create the active mega story creator key
  const activeMegaStoryCreatorKey = `active_mega_story_creators`;

  // create batch size variable
  const BATCH_SIZE = 1000;

  try {
    // fetch active stories once in order to use it for both upgrade and downgrade logic and only select the story ids and expiresAt field
    const activeStories = await Story.find({
      user: storyCreator,
      expiresAt: { $gt: new Date() },
      processingStatus: "ready",
    }).select("_id expiresAt");

    // map through the active stories to get the story ids
    const activeStoryIds = activeStories.map((story) => story._id.toString());

    // check if the status is upgrade
    if (status === "upgrade") {
      // upgrade the user from regular to popular user
      await redisClient.sAdd(activeMegaStoryCreatorKey, storyCreator);

      // get all the storyCreator followers
      const storyCreatorFollowers = Follow.find({
        following: storyCreator,
      })
        .select("follower")
        .lean()
        .cursor({ batchSize: BATCH_SIZE });

      // create a processed count variable in order to track the processed followers which should not exceed BATCH_SIZE (1000)
      let processedCount = 0;

      // create a redis pipeline to execute multiple commands
      let pipeline = redisClient.multi();

      // loop through the storyCreatorFollowers
      for await (const followerDoc of storyCreatorFollowers) {
        // convert the follower id to string
        const followerIdString = followerDoc.follower.toString();

        // create user story feed key for each follower
        const userStoryFeedKey = `user_story_feed:${followerIdString}`;

        // create active regular story key for each follower
        const activeRegularStoryCreatorsKey = `active_regular_story_creators:${followerIdString}`;

        // add the story creator to the popular users followed by each follower
        pipeline.sAdd(
          `popular_users_following:${followerIdString}`,
          storyCreator,
        );

        // check if the active stories array is not empty
        if (activeStories.length > 0) {
          // remove all the active regular stories of the story creator from each follower
          pipeline
            .zRem(userStoryFeedKey, activeStoryIds)
            // remove the story creator from the regular user from each follower
            .zRem(activeRegularStoryCreatorsKey, storyCreator);
        }

        // increase the processed count by 1
        processedCount++;

        // check if the processed count has reached the batch size
        if (processedCount % BATCH_SIZE === 0) {
          // execute the pipeline
          await pipeline.exec();
          // reset the pipeline
          pipeline = redisClient.multi();
        }
      }

      // check if there are any remaining commands in the pipeline to execute
      if (processedCount % BATCH_SIZE !== 0) {
        await pipeline.exec();
      }

      // check if the active stories array is not empty
      if (activeStories.length > 0) {
        /**
         * move the story creator active stories to mega story feed
         * */
        // create mega story creator key
        const megaStoryCreatorKey = `mega_story_user:${storyCreator}`;

        // create a redis pipeline to execute multiple commands
        let megaPipeline = redisClient.multi();

        // loop through the active stories and add them to the mega story feed
        activeStories.forEach((story) => {
          // convert the story id to string
          const storyIdString = story._id.toString();

          // add the story to the mega story feed with expiresAt timestamp as score
          megaPipeline.zAdd(megaStoryCreatorKey, {
            score: new Date(story.expiresAt).getTime(),
            value: storyIdString,
          });
        });

        // get the lastest the expiresAt timestamp from the active stories
        const maxExpiresAt = Math.max(
          ...activeStories.map((s) => new Date(s.expiresAt).getTime()),
        );

        // set the expiration time for the mega story creator key and add 1 hour to the time to live
        megaPipeline.expireAt(
          megaStoryCreatorKey,
          Math.floor(maxExpiresAt / 1000) + 3600,
        );

        // execute the mega pipeline
        await megaPipeline.exec();
      }
    } else if (status === "downgrade") {
      // remove the user from popular list
      await redisClient.sRem(activeMegaStoryCreatorKey, storyCreator);

      // get all the storyCreator followers
      const storyCreatorFollowers = Follow.find({
        following: storyCreator,
      })
        .select("follower")
        .lean()
        .cursor({ batchSize: BATCH_SIZE });

      // create a processed count variable in order to track the processed followers which should not exceed BATCH_SIZE (1000)
      let processedCount = 0;

      // create a redis pipeline to execute multiple commands
      let pipeline = redisClient.multi();

      // loop through the storyCreatorFollowers
      for await (const followerDoc of storyCreatorFollowers) {
        // convert the follower id to string
        const followerIdString = followerDoc.follower.toString();

        // create user story feed key for each follower
        const userStoryFeedKey = `user_story_feed:${followerIdString}`;

        // create active regular story key for each follower
        const activeRegularStoryCreatorsKey = `active_regular_story_creators:${followerIdString}`;

        // remove the story creator from the popular users followed by each follower
        pipeline.sRem(
          `popular_users_following:${followerIdString}`,
          storyCreator,
        );

        // check if the active stories array is not empty
        if (activeStories.length > 0) {
          // add all the active stories of the story creator to each follower
          activeStories.forEach((story) => {
            // convert the story id to string
            const storyIdString = story._id.toString();

            console.log("story expiresAt", story.expiresAt.getTime());

            // add the story to the follower story feed with expiresAt timestamp as score
            pipeline
              .zAdd(userStoryFeedKey, {
                score: new Date(story.expiresAt).getTime(),
                value: storyIdString,
              })
              // add the story creator to the active regular stories of each follower
              .zAdd(activeRegularStoryCreatorsKey, {
                score: new Date(story.expiresAt).getTime(),
                value: storyCreator,
              });
          });
        }
        // increase the processed count by 1
        processedCount++;

        // check if the processed count has reached the batch size
        if (processedCount % BATCH_SIZE === 0) {
          // execute the pipeline
          await pipeline.exec();
          // reset the pipeline
          pipeline = redisClient.multi();
        }
      }

      // check if there are any remaining commands in the pipeline to execute
      if (processedCount % BATCH_SIZE !== 0) {
        await pipeline.exec();
      }

      // remove the story creator mega story feed
      await redisClient.del(`mega_story_user:${storyCreator}`);
    }

    return { strategy: "push", status: "completed" };
  } catch (err) {
    console.error(
      `UserStatusJob Failed for ${storyCreator} during ${status}: `,
      err,
    );
    throw err;
  }
};

module.exports = userStatusStoryJob;
