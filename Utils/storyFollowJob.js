const Story = require("../Models/storyModel");
const redisClient = require("./redisClient");

const storyFollowJob = async (job) => {
  try {
    // destructure the job data
    const { action, storyCreator, isPopularUser, loggedInUser } = job.data;

    // create the redis pipeline
    const pipeline = redisClient.multi();

    // create the popular users following key
    const popularUsersFollowingKey = `popular_users_following:${loggedInUser}`;

    // create the active regular story creators key
    const activeRegularStoryCreatorsKey = `active_regular_story_creators:${loggedInUser}`;

    // create the user story feed key
    const userStoryFeedKey = `user_story_feed:${loggedInUser}`;

    // check if the action is follow
    if (action === "follow") {
      if (isPopularUser) {
        // add the user been followed to the logged in user popular users following list in redis
        pipeline.sAdd(popularUsersFollowingKey, storyCreator);
      } else {
        // get all the active stories of the user been followed
        const activeStories = await Story.find({
          user: storyCreator,
          expiresAt: { $gt: new Date() },
          processingStatus: "ready",
        }).select("_id expiresAt");

        // check if the active stories array is not empty
        if (activeStories.length > 0) {
          // loop through the active stories and add them to the logged in user story feed and also add the user been followed to the logged in user active regular story creators list
          activeStories.forEach((story) => {
            // add the story to the logged in user story feed
            pipeline
              .zAdd(userStoryFeedKey, {
                score: new Date(story.expiresAt).getTime(),
                value: story._id.toString(),
              })

              // add the user been followed to the logged in user active regular story creators list
              .zAdd(activeRegularStoryCreatorsKey, {
                score: new Date(story.expiresAt).getTime(),
                value: storyCreator,
              });
          });
        }
      }
    } else if (action === "unfollow") {
      // remove the user been unfollowed from the logged in user mega following list
      pipeline.sRem(popularUsersFollowingKey, storyCreator);

      // remove the user been unfollowed from the logged in user active regular story creators list
      pipeline.zRem(activeRegularStoryCreatorsKey, storyCreator);

      // get the active stories of the user been unfollowed
      const activeStories = await Story.find({
        user: storyCreator,
        expiresAt: { $gt: new Date() },
        processingStatus: "ready",
      }).select("_id");

      // check if the active stories array is not empty
      if (activeStories.length > 0) {
        // map through the active stories to get the story ids and convert them to string
        const activeStoryIds = activeStories.map((story) => String(story._id));

        // remove the active stories of the user been unfollowed from the logged in user story feed
        pipeline
          .zRem(userStoryFeedKey, activeStoryIds)
          // remove the user been unfollowed from the logged in user active regular story list
          .zRem(activeRegularStoryCreatorsKey, storyCreator);
      }
    }
    // execute the pipeline
    await pipeline.exec();
  } catch (err) {
    console.log(err.message, "message");
    console.error("Error processing story follow job:", err);
    throw err;
  }
};

module.exports = storyFollowJob;
