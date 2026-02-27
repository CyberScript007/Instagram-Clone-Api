const path = require("path");
const sharp = require("sharp");

const catchAsync = require("../../Utils/catchAsync");
const User = require("../../Models/userModel");
const mediaProcessing = require("../../Utils/mediaProcessing");
const Post = require("../../Models/Post/postModel");
const ApiFeatures = require("../../Utils/ApiFeatures");
const sendErrorMiddleware = require("../../Utils/sendErrorMiddleware");
const deleteLocalFile = require("../../Utils/deleteLocalFile");
const PostLike = require("../../Models/Post/postLikeModel");
const PostComments = require("../../Models/Post/PostComment/postCommentModel");
const PostCommentLike = require("../../Models/Post/PostComment/postCommentLikeModel");
const PostCommentReply = require("../../Models/Post/PostCommentReply/postCommentReplyModel");
const PostCommentReplyLike = require("../../Models/Post/PostCommentReply/postCommentReplyLikeModel");
const PostTaggedUser = require("../../Models/Post/PostTaggedUser/PostTaggedUserModel");
const PostSaved = require("../../Models/Post/postSavedModel");
const savedPostQueue = require("../../Utils/savedPostQueue");
const extractMention = require("../../Utils/extractMention");
const notificationQueue = require("../../Utils/notificationQueue");
const mediaProcessingQueue = require("../../Utils/mediaProcessingQueue");
const AudioExtractedFromVideo = require("../../Models/Audio/reelsAudioModel");
const userHomePostQueue = require("../../Utils/userHomePostQueue");
const checkPostVisibility = require("../../Utils/checkPostVisibility");

// middleware to resize images and compressed video
exports.resizeCompressedImagesOrVideos = catchAsync(async (req, res, next) => {
  // check if there is no file uploaded
  if (!req.files || req.files.length === 0) return next();

  // check if the req.files consisit a single video
  const isSinglePostVideo =
    req.files.length === 1 && req.files[0].mimetype.startsWith("video");
  console.log(isSinglePostVideo, "isSinglePostVideo");

  // create the media field with empty array
  req.body.media = [];

  // create a pending jobs array to store all the pending jobs
  req.body.pendingJobs = [];

  // loop through the req.files to push all images and videosinto the media url
  const processingPromises = req.files.map(async (file, i) => {
    console.log(file);
    if (file.mimetype.startsWith("image")) {
      // compute the name for the image uploaded
      const filename = `post-${req.user.id}-${Date.now()}-${i + 1}.jpeg`;

      // use sharp package to resize and compressed the image
      await sharp(file.buffer)
        .resize(599, 599)
        .toFormat("jpeg")
        .jpeg({ quality: 80 })
        .toFile(`public/img/post/${filename}`);

      // push the filename into the media url
      req.body.media.push({
        url: `${process.env.DEVELOPMENT_URL}img/post/${filename}`,
        mediaType: "image",
        aspectRatio: "1:1",
        processingStatus: "ready",
      });

      // remove uncompressed image file from file.path if there is any
      if (file.path) await deleteLocalFile(file.path);
    } else if (file.mimetype.startsWith("video")) {
      try {
        // get neccessary data from mediaProcessing module
        const { filename, duration, aspectRatio } = await mediaProcessing({
          filePath: file.path,
          type: "video",
          destinationDir: "public/video/post",
          maxDuration: 3600,
          checkDuration: true,
          isCompressed: false,
          contentType: "post",
          isExtractedAudio: false,
        });

        // set the video and thumbnail url to null, so far the video is still processing
        req.body.media.push({
          url: filename,
          duration,
          processingStatus: "pending",
          aspectRatio,
          mediaType: "video",
        });

        // push a pending job into the pendingJobs array
        req.body.pendingJobs.push({
          filePath: file.path,
          placeHolderUrl: filename,
          shouldExtractedAudio: isSinglePostVideo,
        });
      } catch (err) {
        return next(new sendErrorMiddleware(err.message, 400));
      }
    }
  });

  // wait for all the image and video processing to be completed
  await Promise.all(processingPromises);

  // determine the isReels field, if the aspect ratio is 9:10 and the user only upload one video, then it is a reels
  const isReelsVideo =
    req.body.media.length === 1 &&
    req.body.media[0].mediaType === "video" &&
    req.body.media[0].aspectRatio === "9:16";

  // set the isReels field to true or false
  req.body.isReels = isReelsVideo;

  // move to next middleware
  next();
});

exports.createPost = catchAsync(async (req, res, next) => {
  // create a audioRef variable
  let audioRef = null;

  // check if the logged in user passed an existing audio id to reuse
  if (req.body.audioId) {
    // Atomically increment the usage count and validate existence in a single database operation.
    // { new: true } ensures the updated document is returned, or null if not found.
    const updatedAudio = await AudioExtractedFromVideo.findByIdAndUpdate(
      { _id: req.body.audioId },
      {
        $inc: { usageCount: 1 },
      },
      { new: true, runValidators: true },
    );

    // check if the updated audio does not exist and send error message to the user
    if (!updatedAudio) {
      return next(
        new sendErrorMiddleware(
          "The specified audio reference was not found",
          404,
        ),
      );
    }

    // if the updated audio successfully updated, pass the updated audio _id into the audio ref
    audioRef = updatedAudio._id;
  }

  // create post
  const newPost = await Post.create({
    user: req.user.id,
    media: req.body.media,
    caption: req.body.caption,
    isReels: req.body.isReels,
    audioRef,
  });

  // check if the pendingJobs array is not empty, then add each job to the media processing queue
  if (req.body.pendingJobs && req.body.pendingJobs.length > 0) {
    const mediaProcessingPromises = req.body.pendingJobs.map((obj) => {
      // get the media item from the newPost media array which is processingStatus is pending and the url is the same as the placeHolderUrl
      const mediaItem = newPost.media.find(
        (m) => m.url === obj.placeHolderUrl && m.processingStatus === "pending",
      );

      console.log(mediaItem);

      // check if the mediaItem exist and then add the job to the media processing queue
      if (mediaItem) {
        return mediaProcessingQueue.add(
          "process-media",
          {
            filePath: obj.filePath,
            contentId: newPost._id.toString(),
            contentType: "post",
            mediaId: mediaItem._id.toString(),
            userId: req.user.id,
            username: req.user.username,
            duration: mediaItem.duration,
            isExtractedAudio: obj.shouldExtractedAudio,
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

    // wait for all the media processing job to be added to the queue
    await Promise.all(mediaProcessingPromises);
  }

  // pass post caption into extractMention function to extract the user username without including the @ character
  const mentions = extractMention(newPost.caption);

  // check if the mention length is greater 0, then use the mentions array to find all the user by their username from database
  if (mentions?.length > 0) {
    const mentionUsers = await User.find({
      username: { $in: mentions },
    });

    // for each of the user then send a real time notification to them if another mention them in their caption
    const mentionNotificationPromises = mentionUsers.map((mentionUser) => {
      return notificationQueue.add(
        {
          receiver: mentionUser._id.toString(),
          sender: newPost.user,
          type: "mention",
          post: newPost._id,
          typeMention: "post",
          postCaption: newPost.caption,
          message: `${newPost.user} mention you in a post`,
        },
        {
          priority: 5,
          removeOnComplete: { count: 1000 }, // keep the latest 1000 completed jobs in the queue and remove the rest to prevent the queue from growing indefinitely
          removeOnFail: { age: 24 * 3600 }, // remove the failed jobs after 24 hours to prevent the queue from growing indefinitely
          attempts: 2, // retry the job twice if it fails to process the job, this is useful when there is a temporary error such as network error or database connection error
        },
      );
    });

    // wait for all the mention notification job to be added to the queue
    await Promise.all(mentionNotificationPromises);
  }

  // ------------------------------------------------------------------
  // 2. NEW LOGIC: POST FAN-OUT (Distribution to followers' feeds)
  // ------------------------------------------------------------------
  // Add a job to a dedicated fan-out queue. This job will asynchronously
  // fetch all followers and perform the bulkWrite operation to update
  // their UserFeed documents. This is crucial to ensure all users
  // receive the post immediately, regardless of content type.
  await userHomePostQueue.add(
    "user-home-post-feed",
    {
      postId: newPost._id,
      userId: req.user.id,
    },
    {
      priority: 2,
      attempts: 3, // retry the job up to 3 times if it fails, this is useful when there is a temporary error such as network error or database connection error
      jobId: `user-home-post-feed-${newPost._id}-${req.user.id}`, // unique job ID to prevent duplicate jobs for the same post
      backoff: {
        type: "fixed",
        delay: 10000, // fixed delay of 10 seconds before retrying the job if it fails
      },
    },
  );

  // send response to user
  res.status(201).json({
    status: "success",
    results: newPost.length,
    message: "Post created successfully",
    data: newPost,
  });
});

// preselect some field when getting all the post
exports.preselectPostField = (req, res, next) => {
  req.query.fields = "user,media,isHidden";
  next();
};

// get all posts
exports.getAllPosts = catchAsync(async (req, res, next) => {
  // store the logged in user into a variable
  const loggedInUser = req.user._id;

  // CRITICAL: Determine whose profile is being viewed.
  // We assume the user ID is passed in the route (e.g., /api/v1/users/:userId/posts)
  // If no ID is passed, default to the requesting user's own profile.
  const profileOwnerId = req.params.userId || loggedInUser;

  // store the value returned from checkPostVisibility function into a variable
  const userPostCanBeView = await checkPostVisibility(
    loggedInUser,
    profileOwnerId,
  );

  // check if the user post can be view or not
  if (!userPostCanBeView) {
    return next(
      new sendErrorMiddleware(
        "This account is private, follow to see their photos and videos",
      ),
    );
  }

  // get all the post created by this user
  // use ApiFeatures to perform so data manipulation
  const features = new ApiFeatures(
    req.query,
    Post.find({ user: loggedInUser, isHidden: false }),
  )
    .filter()
    .sort()
    .limitFields()
    .pagination();

  // get all post
  const posts = await features.query;

  // throw an error if there is no post
  if (!posts) {
    return next(
      new sendErrorMiddleware(
        "Please create a post, you don't have any post posted yet",
        400,
      ),
    );
  }

  // send response to use
  res.status(200).json({
    status: "success",
    results: posts.length,
    data: posts,
  });
});

// get a post
exports.getPost = catchAsync(async (req, res, next) => {
  // get the logged in user from the protected route
  const loggedInUser = req.user.id;

  // get post by id
  const post = await Post.findOne({
    _id: req.params.id,
    isHidden: false,
  })
    .populate("taggedPosts")
    .lean();

  // check if the post still exists
  if (!post) {
    return next(new sendErrorMiddleware("Post not found", 404));
  }

  // store the post creator in a variable
  const postCreator = post.user ? post.user._id : null;

  // store the value returned from checkPostVisibility function into a variable
  const userPostCanBeView = await checkPostVisibility(
    loggedInUser,
    profileOwnerId,
  );

  // check if the user post can be view or not
  if (!userPostCanBeView) {
    return next(
      new sendErrorMiddleware(
        "This account is private, follow to see their photos and videos",
      ),
    );
  }

  // check if the logged in user is the creator of the post
  const isPostCreator = String(postCreator) === loggedInUser;

  // send the post the user
  res.status(200).json({
    status: "success",
    data: {
      ...post,
      isPostCreator,
    },
  });
});

// update the user post but the user cannot change their images or video they posted before
// create a filter that will make sure the user does not update their videos or images
const filterVideosImages = (req, ...fields) => {
  // create empty object that will be return as the data that we want to upload
  const newObj = {};

  // loop through the req.body keys to create newObj
  Object.keys(req.body).forEach((el) => {
    if (fields.includes(el)) {
      newObj[el] = req.body[el];
    }
  });

  // return the newObj to be able to update the user post
  return newObj;
};

// update the user post
exports.updatePosts = catchAsync(async (req, res, next) => {
  // store the post id into a variable by destructuring the req.params
  const { postId } = req.params;

  // store the logged in user into a variable
  const loggedInUser = req.user._id;

  // create the filter object
  const filterObject = filterVideosImages(
    req,
    "hideLikes",
    "hideComment",
    "caption",
    "taggedUser",
    "isHidden",
  );

  // check if the user try to change their images or videos
  if (req.body.media || req.files) {
    return next(
      new sendErrorMiddleware(
        "You cannot change your video(s) or image(s)",
        400,
      ),
    );
  }

  // A post can only be update by the user that created it
  const updatedPost = await Post.findOneAndUpdate(
    { _id: postId, user: loggedInUser },
    filterObject,
    {
      new: true,
      runValidators: true,
    },
  );

  // check if the post exist
  if (!updatedPost) {
    return next(
      new sendErrorMiddleware(
        "You cannot update or change a post that is not created by you",
        400,
      ),
    );
  }

  // check if the user want to change the caption and if the user write another hash words or add up to the existing one, if it was true then update the hashtags manual and save it into the database
  if (
    updatedPost.caption &&
    updatedPost.caption.match(/#(\w+)/g)?.length >= 1
  ) {
    updatedPost.hashtags = updatedPost.caption
      .match(/#(\w+)/g)
      ?.map((tag) => tag.slice(1).toLowerCase());

    await updatedPost.save();
  } else {
    // if the above condition is not true set the hashtags field into empty and save it to the database
    updatedPost.hashtags = [];
    await updatedPost.save();
  }

  // use the post id to find the post that is saved
  const savedPost = await PostSaved.findOne({ post: postId });

  // also update the post that is added to the queue
  await savedPostQueue.add("saved-post", {
    savedPostId: savedPost?._id,
    postId,
  });

  // send the newly updated post to the user
  res.status(200).json({
    status: "success",
    data: updatedPost,
  });
});

// delete post
exports.deletePosts = catchAsync(async (req, res, next) => {
  // store the postId into a variable by destructing the req.params
  const { postId } = req.params;

  // store the logged in user in a variable
  const loggedInUser = req.user._id;

  // A post can only be deleted by the user who created the post
  const post = await Post.findOne({
    user: loggedInUser,
    _id: postId,
    isHidden: false,
  });

  // check if the post exist
  if (!post) {
    return next(
      new sendErrorMiddleware(
        "You cannot delete this post because you are not the who one created it or this post is hidden",
        400,
      ),
    );
  }

  // loop through the media field to delete all files
  await Promise.all(
    post.media.map(async (mediaItem) => {
      // check if the mediaType is image
      if (mediaItem.mediaType === "image") {
        // replace the development url with empty string
        const relativeImagePath = mediaItem.url.replace(
          process.env.DEVELOPMENT_URL,
          "",
        );

        // add public path to the image path
        const absoluteImagePath = path.join("public", relativeImagePath);
        await deleteLocalFile(absoluteImagePath);
      }

      // check if the mediaType is video
      if (mediaItem.mediaType === "video") {
        // replace the development url with empty string
        const relativeVideoPath = mediaItem.url.replace(
          process.env.DEVELOPMENT_URL,
          "",
        );
        const relativeThumbnailPath = mediaItem.thumbnail.replace(
          process.env.DEVELOPMENT_URL,
          "",
        );

        // add public path to the video and thumbnail path
        const absoluteVideoPath = path.join("public", relativeVideoPath);
        const absoluteThumbnailPath = path.join(
          "public",
          relativeThumbnailPath,
        );

        // delete both the thumbnail and video file
        await deleteLocalFile(absoluteVideoPath);
        await deleteLocalFile(absoluteThumbnailPath);
      }
    }),
  );

  // delete the post like
  await PostLike.deleteMany({ post: postId });

  // get all comment on this post and select only their id
  const comments = await PostComments.find({ post: postId }, "_id").lean();

  // store only the _id values inside array
  const commentIds = comments.map((c) => c._id);

  // use the commentIds array to delete the likes that any of the comment has
  await PostCommentLike.deleteMany({ postComment: { $in: commentIds } });

  // use the commentIds array to select all the reply each comment has
  const reply = await PostCommentReply.find({
    postComment: { $in: commentIds },
  }).lean();

  // store only the reply _id values inside array
  const replyIds = reply.map((r) => r._id);

  // use the replyIds to delete all the likes each reply comment has
  await PostCommentReplyLike.deleteMany({
    postCommentReply: { $in: replyIds },
  });

  // delete all the comment reply of this post
  await PostCommentReply.deleteMany({ postComment: { $in: commentIds } });

  // delete all the comments that this post has
  await PostComments.deleteMany({ post: postId });

  // get all the post saved
  const savedPosts = await PostSaved.find({ post: postId });

  // delete the post saved
  await PostSaved.deleteMany({ post: postId });

  // add the saved postjob to queue when also deleting a post
  const savedPostPromises = savedPosts.map((savedPost) => {
    return savedPostQueue.add("saved-post", {
      savedPostId: saved._id,
      postId: saved.post,
      loggedInUser,
      type: "delete",
    });
  });

  // wait for all the saved post job to be added to the queue
  await Promise.all(savedPostPromises);

  // delete all the tagged post by user
  await PostTaggedUser.deleteMany({ post: postId });

  // delete the post from the database
  await post.deleteOne();

  // send response to user
  res.status(204).json({
    status: "success",
    data: null,
  });
});
