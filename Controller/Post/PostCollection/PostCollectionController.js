const PostCollection = require("../../../Models/Post/PostCollection/PostCollectionModel");
const Post = require("../../../Models/Post/postModel");
const PostSaved = require("../../../Models/Post/postSavedModel");
const catchAsync = require("../../../Utils/catchAsync");
const sendDifferentResponse = require("../../../Utils/sendDifferentResponse");
const sendErrorMiddleware = require("../../../Utils/sendErrorMiddleware");

const savedPostQueue = require("../../../Utils/savedPostQueue");
const redisClient = require("../../../Utils/redisClient");

// create custom collection
exports.createCustomCollection = catchAsync(async (req, res, next) => {
  // get the name of the collection from the user
  const { name } = req.body;

  // store the logged in user into a variable
  const loggedInUser = req.user.id;

  // create the custom collection
  const customCollection = await PostCollection.create({
    user: loggedInUser,
    name,
    isDefault: false,
  });

  // check if the user try to create another default collection
  if (customCollection.isDefault) {
    return next(
      new sendErrorMiddleware(
        "You cannot create another default collection",
        400,
      ),
    );
  }

  // populate the user who create the custom collect
  const populateCustomCollectionUser = await PostCollection.findById(
    customCollection._id,
  )
    .populate("user")
    .lean();

  res.status(201).json({
    status: "success",
    message: "Collection successfully created",
    data: populateCustomCollectionUser,
  });
});

// Get only  the default collection of a user
exports.getDefaultUserCollection = catchAsync(async (req, res, next) => {
  // store the logged in user into a variable
  const loggedInUser = req.user.id;

  // use the logged in user id to get the default collection of the user
  const defaultCollection = await PostCollection.findOne({
    user: loggedInUser,
    isDefault: true,
  });

  // check if the defaultCollect exist
  if (!defaultCollection) {
    return next(new sendErrorMiddleware("Default collection not found", 404));
  }

  // populate the user that create the default collection
  const populateDefaultCollectionUser = await PostCollection.findById(
    defaultCollection._id,
  ).populate("user");

  // send the default collection to the user
  res.status(200).json({
    status: "success",
    data: populateDefaultCollectionUser,
  });
});

// get all the custom collection the user created
exports.getAllUserCustomCollection = catchAsync(async (req, res, next) => {
  // store the logged in user into a variable
  const loggedInUser = req.user.id;

  // get all the custom collection for this user
  const customCollections = await PostCollection.find({
    user: loggedInUser,
    isDefault: false,
  });

  // send the custom collections to user
  res.status(200).json({
    status: "success",
    results: customCollections.length,
    data: customCollections,
  });
});

// Rename only the custom collections
exports.RenameCustomCollection = catchAsync(async (req, res, next) => {
  // get the collection id from the user by destructuring req.params
  const { collectionId } = req.params;

  // get the new name of custom collection from the user
  const { newName } = req.body;

  // store the logged in user into a variable
  const loggedInUser = req.user.id;

  // use the collectId to get the user custom collection and update it
  const updateCollection = await PostCollection.findOneAndUpdate(
    { user: loggedInUser, _id: collectionId },
    { name: newName },
    {
      new: true,
      runValidators: true,
    },
  );

  // check if the custom updateCollection exist
  if (!updateCollection) {
    return next(new sendErrorMiddleware("Collection not found", 404));
  }

  // check if the use try to rename the default collection
  if (updateCollection.isDefault) {
    return next(
      new sendErrorMiddleware("You cannot rename the default ollection", 400),
    );
  }

  // send the new custom collection to the user
  res.status(200).json({
    status: "success",
    data: updateCollection,
  });
});

// add post to custom collection
exports.addPostToCustomCollection = catchAsync(async (req, res, next) => {
  // get both the post id and custom collection id in a variable by destructuring req.params
  const { postId, collectionId } = req.params;

  // saved the logged in user into a variable
  const loggedInUser = req.user.id;

  // check if the post exist
  const post = await Post.findById(postId);

  if (!post) {
    return next(
      new sendErrorMiddleware(
        "You cannot add a post that has been deleted or missing into a collection",
        404,
      ),
    );
  }

  // check if the post is hidden
  if (post.isHidden) {
    return next(
      new sendErrorMiddleware(
        "You cannot add a hidden post into a collection",
        403,
      ),
    );
  }

  // check if the logged in user is the one that created the post
  const isPostCreator = String(post.user._id) === loggedInUser;

  // check if the user has a default collection
  const defaultCollection = await PostCollection.findOne(
    { user: loggedInUser, isDefault: true },
    "_id",
  );

  // check if the post is also saved into default collection, if not saved the post into the default collection
  const checkPostInDefaultCollection = await PostSaved.findOne({
    user: loggedInUser,
    post: postId,
    postCollection: defaultCollection,
    deleted: false,
  });

  // send error message if the post has not been saved into default collection
  if (!checkPostInDefaultCollection) {
    return next(
      new sendErrorMiddleware(
        "You can only save a post that has been saved into default collection",
        403,
      ),
    );
  }

  // check if the custom collection exist
  const customCollection = await PostCollection.findById(collectionId);

  if (!customCollection) {
    return next(new sendErrorMiddleware("The collection is not found", 404));
  }

  // check if the post has been saved into this collection before
  const postExistInCollection = await PostSaved.findOne({
    user: loggedInUser,
    postCollection: collectionId,
    post: postId,
    deleted: false,
  });

  if (postExistInCollection) {
    return next(
      new sendErrorMiddleware("The post already exist in this collection", 400),
    );
  }

  // check if the user want to re-add the post into custom collection
  const alreadySavedPostInCustomCollection = await PostSaved.findOne({
    user: loggedInUser,
    post: postId,
    postCollection: collectionId,
  });

  // check if the post is still saved in default collection and the post is still exist but has been soft deleted in the custom collection
  if (
    !checkPostInDefaultCollection.deleted &&
    alreadySavedPostInCustomCollection
  ) {
    // re-add the post into the default collection
    alreadySavedPostInCustomCollection.deleted = false;
    alreadySavedPostInCustomCollection.deletedAt = null;
    await alreadySavedPostInCustomCollection.save();

    // add job to background queue
    await savedPostQueue.add("saved-post", {
      savedPostId: alreadySavedPostInCustomCollection._id,
      postId,
    });

    return sendDifferentResponse({
      res,
      isPostCreator,
      saved: true,
      message: "Post re-add to custom collection",
    });
  }

  // if the user is adding the post into this collection for the first time
  const savedPost = await PostSaved.create({
    user: loggedInUser,
    post: postId,
    postCollection: collectionId,
  });

  // add job to background queue
  await savedPostQueue.add("saved-post", {
    savedPostId: savedPost._id,
    postId,
  });

  // send response to user
  return sendDifferentResponse({
    res,
    isPostCreator,
    saved: true,
    message: "Post add to custom collection successfully",
  });
});

// get all the post that saved in a custom collection
exports.getAllPostSavedInCustomCollection = catchAsync(
  async (req, res, next) => {
    // get the collection id by destructuring req.params
    const { collectionId } = req.params;

    // store the logged in user into a variable
    const loggedInUser = req.user._id;

    // check if the custom collection still exist
    const customCollection = await PostCollection.findById(collectionId);

    if (!customCollection) {
      return next(
        new sendErrorMiddleware("The custom collection is not found", 400),
      );
    }

    // get all the post saved in this custom collection
    const savedPost = await PostSaved.find({
      user: loggedInUser,
      postCollection: collectionId,
      deleted: false,
    });

    // send response to the user
    res.status(200).json({
      status: "success",
      results: savedPost.length,
      data: savedPost,
    });
  },
);

// get a single post saved in custom collection
exports.getSinglePostSaved = catchAsync(async (req, res, next) => {
  // store the collection id and post id into a variable by destructuring req.params
  const { postId, collectionId } = req.params;

  // store the logged in user into a variable
  const loggedInUser = req.user._id;

  // check if the custom collection still exist
  const customCollection = await PostCollection.findById(collectionId);

  if (!customCollection) {
    return next(
      new sendErrorMiddleware("The custom collection not found", 404),
    );
  }

  // use the custom collection and post id to get the single post saved
  const savedPost = await PostSaved.findOne({
    user: loggedInUser,
    post: postId,
    postCollection: collectionId,
  });

  // if the post does not exist send error message to the user
  if (!savedPost) {
    return next(
      new sendErrorMiddleware(
        "The saved post in this custom collection has been deleted",
        404,
      ),
    );
  }

  // send the saved post to the user
  res.status(200).json({
    status: "success",
    data: savedPost,
  });
});

//  create removePostFromAllCollections function
const removePostFromAllCollections = async ({
  res,
  loggedInUser,
  postId,
  defaultCollection,
}) => {
  // remove the post from both default collection and custom collection
  await PostSaved.updateMany(
    {
      user: loggedInUser,
      deleted: false,
      $or: [
        { postCollection: { $ne: defaultCollection } },
        { postCollection: defaultCollection },
      ],
    },
    { deleted: true, deletedAt: new Date() },
  );

  await redisClient.del(`saved:${loggedInUser}:${postId}`);

  return res.status(200).json({
    status: "success",
    message: "Post successfully deleted from all collections",
  });
};

// remove post from custom collection
exports.removePostFromCustomCollection = catchAsync(async (req, res, next) => {
  // get the post id and the collection from the user, by destructuring req.params
  const { postId, collectionId } = req.params;

  // get some properties from user by destructuring req.body
  const { removeAll, removeCustomCollection } = req.body;

  // store the logged in user into a variable
  const loggedInUser = req.user.id;

  // check is the post exist
  const post = await Post.findById(postId);

  if (!post) {
    return next(
      new sendErrorMiddleware("This post has been deleted or removed", 404),
    );
  }

  // check if the post is hidden
  if (post.isHidden) {
    return next(
      new sendErrorMiddleware(
        "You cannot remove a hidden post from a collection",
        403,
      ),
    );
  }

  // check if the collection exist
  const customCollection = await PostCollection.findById(collectionId);

  if (!customCollection) {
    return next(
      new sendErrorMiddleware(
        "This custom collectionn has been deleted or removed",
        404,
      ),
    );
  }

  // check if the logged in user is the one that created the post
  const isPostCreator = String(post.user._id) === loggedInUser;

  // get the default collection of the user
  const defaultCollection = await PostCollection.findOne(
    {
      user: loggedInUser,
      isDefault: true,
    },
    "_id",
  );

  // check if the post was in default collection
  const checkPostInDefaultCollection = await PostSaved.findOne({
    user: loggedInUser,
    post: postId,
    postCollection: defaultCollection,
    deleted: false,
  });

  if (!checkPostInDefaultCollection) {
    return next(
      new sendErrorMiddleware(
        "This post has not been saved in default collection",
        400,
      ),
    );
  }

  // 1) check if the post saved was created by the logged in user
  if (isPostCreator) {
    return await removePostFromAllCollections({
      res,
      loggedInUser,
      postId,
      defaultCollection,
    });
  }

  // 2) if the user only want to remove the post from custom collection
  if (!isPostCreator && removeCustomCollection === true) {
    await PostSaved.updateMany(
      {
        user: loggedInUser,
        deleted: false,
        postCollection: customCollection,
      },
      { deleted: true, deletedAt: new Date() },
    );

    return res.status(200).json({
      status: "success",
      isShowModal: true,
      message: "Post remove from custom collection",
    });
  }

  // 3) if the user want to remove the post from all collections
  if (!isPostCreator && removeAll === true) {
    return await removePostFromAllCollections({
      res,
      loggedInUser,
      postId,
      defaultCollection,
    });
  }
});

// Delete a custom collection
exports.deleteCustomCollection = catchAsync(async (req, res, next) => {
  // get the custom collections id from req.params
  const { collectionId } = req.params;

  // check if the custom collection exists
  const customCollection = await PostCollection.exists({ _id: collectionId });

  if (!customCollection) {
    return next(
      new sendErrorMiddleware("Custom collection does not exists", 404),
    );
  }

  // get all the post saved in this collection and delete them
  await PostSaved.findOneAndDelete({ postCollection: collectionId });

  // delete the custom collection from the database
  await PostCollection.findByIdAndDelete(collectionId);

  // send response to the user
  res.status(204).json({
    status: "success",
    data: null,
  });
});
