const AudioCollection = require("../../Models/Audio/audioCollectionModel");
const AudioExtractedFromVideo = require("../../Models/Audio/reelsAudioModel");
const SavedAudio = require("../../Models/Audio/savedAudioModel");
const ApiFeatures = require("../../Utils/ApiFeatures");
const catchAsync = require("../../Utils/catchAsync");
const redisClient = require("../../Utils/redisClient");
const sendErrorMiddleware = require("../../Utils/sendErrorMiddleware");

// create an update audio function, to avoid repeation of code
const updateAudioSavedFunc = async ({ filter, res, next, redisKey }) => {
  // soft deleting the audio saved
  const unsavedAudio = await SavedAudio.findOneAndUpdate(
    filter,
    {
      deleted: true,
      deletedAt: Date.now(),
    },
    { new: true, runValidators: true },
  );

  // check if the audio saved exists
  if (!unsavedAudio) {
    return next(new sendErrorMiddleware("Audio saved does not found", 404));
  }

  // delete the redis key from the cache
  await redisClient.del(redisKey);

  // send response to the user
  res.status(200).json({
    status: "success",
    isSaved: false,
    message: "Audio successfully unsaved",
  });
};

exports.toggleSavedAudio = catchAsync(async (req, res, next) => {
  // get the audio id from req.params
  const { audioId } = req.params;

  // store the logged in user into a variable
  const loggedInUser = req.user.id;

  // store the redis key into a variable
  const redisKey = `saved:${loggedInUser}:${audioId}`;

  // use the redisKey to retrieved the value from redis
  const isCached = await redisClient.get(redisKey);

  // check if there is an audio default collection for the logged in user
  const audioDefaultCollection = await AudioCollection.findOne({
    user: loggedInUser,
    isDefault: true,
  }).select("_id");

  if (!audioDefaultCollection) {
    return next(
      new sendErrorMiddleware("Please a default audio collection", 404),
    );
  }

  // create a filter object
  const filter = {
    user: loggedInUser,
    audio: audioId,
    audioCollection: audioDefaultCollection,
  };

  // check if the audio exist
  const audio = await AudioExtractedFromVideo.findById(audioId);

  if (!audio) {
    return next(new sendErrorMiddleware("Audio not found", 404));
  }

  // check if the audio is being and unsaved it
  if (isCached === "1") {
    return await updateAudioSavedFunc({
      filter,
      res,
      next,
      redisKey,
    });
  }

  // also check if the audio is soft deleted in the database and resaved it in the database by setting the audio deleted field to false and deletedAt to null
  const alreadyExistAudio = await SavedAudio.findOne(filter);

  if (alreadyExistAudio && alreadyExistAudio.deleted) {
    // set the already exixt audio deleted field to false and deletedAt to null
    alreadyExistAudio.deleted = false;
    alreadyExistAudio.deletedAt = null;
    await alreadyExistAudio.save();

    // update the redis cache
    await redisClient.set(redisKey, "1");

    // send response to user
    return res.status(200).json({
      status: "success",
      isSaved: true,
      message: "Audio re-saved successfully",
    });
  }

  // Stale correction: if the user try to saved an audio but the audio was saved in the database, the deleted is set to false and the redis key has been deleted, which make the redis return null indicating that the audio wasn't saved in the database, so we have to force the audio to be unsaved in order to correct both the redis and database operation

  if (alreadyExistAudio && alreadyExistAudio.deleted === false) {
    return await updateAudioSavedFunc({
      filter,
      res,
      next,
      redisKey,
    });
  }

  // if the audio has not been saved into database before
  const savedAudio = await SavedAudio.create(filter);

  // set the redis value to 1
  await redisClient.set(redisKey, "1");

  // send response to user
  res.status(201).json({
    status: "success",
    isSaved: true,
    message: "Audio saved successfully",
    savedAudio,
  });
});

// get all the saved audio by user
exports.getAllSavedAudio = catchAsync(async (req, res, next) => {
  // store the logged in user into a variable
  const loggedInUser = req.user.id;

  // store the default audio collection into a variable
  const audioDefaultCollection = await AudioCollection.findOne({
    user: loggedInUser,
    isDefault: true,
  }).select("_id");

  // create an initial query
  const initialQuery = SavedAudio.find({
    user: loggedInUser,
    audioCollection: audioDefaultCollection,
    deleted: false,
  });

  // use ApiFeatures to filter, sort, limit fields and paginate the saved audio
  const features = new ApiFeatures(req.query, initialQuery)
    .filter()
    .sort()
    .limitFields()
    .pagination();

  // saved the features query into a variable
  const savedAudios = await features.query;

  // send respose to user
  res.status(200).json({
    status: "success",
    results: savedAudios.length,
    data: savedAudios,
  });
});

// geta single saved audio
exports.getSingleSavedAudio = catchAsync(async (req, res, next) => {
  // get the audioId by destructuring req.params
  const { audioId } = req.params;

  // store the logged in user into a variable
  const loggedInUser = req.user.id;

  // check if the audio exist
  const audio = await AudioExtractedFromVideo.findOne({ _id: audioId });

  if (!audio) {
    return next(new sendErrorMiddleware("Audio not found", 404));
  }

  // get the user audio default collection and only select id
  const audioDefaultCollection = await AudioCollection.findOne({
    user: loggedInUser,
    isDefault: true,
  }).select("_id");

  // check if the audio was saved
  const savedAudio = await SavedAudio.findOne({
    user: loggedInUser,
    audio: audioId,
    audioCollection: audioDefaultCollection,
    deleted: false,
  });

  if (!savedAudio) {
    return next(new sendErrorMiddleware("You have not saved this audio"));
  }

  // send response to user
  res.status(200).json({
    status: "success",
    data: savedAudio,
  });
});
