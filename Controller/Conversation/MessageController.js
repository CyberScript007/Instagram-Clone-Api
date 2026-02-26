const { default: mongoose } = require("mongoose");
const fs = require("fs").promises;
const sharp = require("sharp");
const Conversation = require("../../Models/Conversation/conversationModel");
const Message = require("../../Models/Conversation/messageModel");
const catchAsync = require("../../Utils/catchAsync");
const ApiFeatures = require("../../Utils/ApiFeatures");
const mediaProcessing = require("../../Utils/mediaProcessing");
const sendErrorMiddleware = require("../../Utils/sendErrorMiddleware");
const stripPublicPath = require("../../Utils/stripPublicPath");

// resize the images, videos and audio uploaded for messages
exports.processMessageMedia = catchAsync(async (req, res, next) => {
  // check if there is no file to be processed
  if (!req.files || Object.keys(req.files).length === 0) return next();

  // assign empty array to the media property of the request body
  req.body.media = [];

  // await on all the files to be processed
  await Promise.all(
    req.files.map(async (file, i) => {
      // process gif image if there is any
      if (file.mimetype === "image/gif") {
        // give each gif image a unique name
        const filename = `message-gif-${req.user.id}-${Date.now()}-${i}.gif`;

        // create the file path to store the gif image
        const filePath = `public/img/message/${filename}`;

        // write the file to the destination folder
        await fs.writeFile(filePath, file.buffer, "utf-8", (err) => {
          if (err) {
            console.error("Error writing file:", err);

            return next(
              new sendErrorMiddleware("Failed to process GIF image", 500),
            );
          }
        });

        // push filename into the media array
        req.body.media.push({
          url: `${process.env.DEVELOPMENT_URL}/img/message/${filename}`,
          mediaType: "gif",
        });
      }

      // process image files if there is any
      else if (
        file.mimetype.startsWith("image") &&
        !file.mimetype.startsWith("image/gif")
      ) {
        // give each image a unique name
        const filename = `message-image-${req.user.id}-${Date.now()}-${i}.jpeg`;

        // reformat and resize the image using sharp
        await sharp(file.buffer)
          .resize(800, 800)
          .toFormat("jpeg")
          .jpeg({ quality: 90 })
          .toFile(`public/img/message/${filename}`);

        // push filename into the media array
        req.body.media.push({
          url: `${process.env.DEVELOPMENT_URL}/img/message/${filename}`,
          mediaType: "image",
        });
      }

      // process video files if there is any
      else if (file.mimetype.startsWith("video")) {
        // get the neccessary data from mediaProcessing module
        const { filename, thumbnailUrl } = await mediaProcessing({
          filePath: file.path,
          userId: req.user.id,
          type: "video",
          destinationDir: "public/video/message",
        });

        // convert both the main filename  and thumbnail url seperators to forward /
        const filenameToForwardSlash = filename.replace(/\\/g, "/");
        const thumbnailUrlToForwardSlash = thumbnailUrl.replace(/\\/g, "/");

        // remove the public path from both video and thumbnail url
        const filenameUrl = stripPublicPath(filenameToForwardSlash);
        const thumbnailPathUrl = stripPublicPath(thumbnailUrlToForwardSlash);

        // push the video data into the media array
        req.body.media.push({
          url: `${process.env.DEVELOPMENT_URL}${filenameUrl}`,
          mediaType: "video",
          thumbnail: `${process.env.DEVELOPMENT_URL}${thumbnailPathUrl}`,
        });
      }

      // process audio files if there is any
      else if (file.mimetype.startsWith("audio")) {
        // get the neccessary data from mediaProcessing module
        const { filename } = await mediaProcessing({
          filePath: file.path,
          userId: req.user.id,
          type: "audio",
          destinationDir: "public/audio/message",
        });

        // convert audio filename seperators to forward /
        const audioFilenameUrlToSlash = filename.replace(/\\/g, "/");

        // remove public path from the audio filename
        const filenameUrl = stripPublicPath(audioFilenameUrlToSlash);

        // push the audio data into the media array
        req.body.media.push({
          url: `${process.env.DEVELOPMENT_URL}${filenameUrl}`,
          mediaType: "audio",
        });
      }

      // process document files if there is any
      else if (
        file.mimetype.startsWith("application") ||
        file.mimetype.startsWith("text")
      ) {
        // convert document or text files seperators to forward /
        const documentOrTextUrlToSlash = file.path.replace(/\\/g, "/");

        // remove public path from the document filename
        const filename = stripPublicPath(documentOrTextUrlToSlash);

        // push the document data into the media array
        req.body.media.push({
          url: `${process.env.DEVELOPMENT_URL}${filename}`,
          mediaType: "document",
        });
      }
    }),
  );

  // if there is no error call the next middleware
  next();
});

// send message to a specific conversation
exports.sendMessage = catchAsync(async (req, res, next) => {
  // get the conversation id from the request parameters
  const { conversationId } = req.params;

  // store the logged in user into a variable
  const loggedInUser = req.user.id;

  // destructure the request body
  const { text, media, repliedToID, callEvent } = req.body;

  // check if the conversation exists and includes the logged in user
  const conversation = await Conversation.findOne({
    _id: conversationId,
    participants: { $in: [loggedInUser] },
  });

  if (!conversation) {
    return next(
      new sendErrorMiddleware(
        "Conversation not found or you not include in this conversation",
        404,
      ),
    );
  }

  // create batch of messages to be inserted
  const messagesToInsert = [];

  // store the common fields for each message into a variable
  const commonMessageFields = {
    conversation: conversationId,
    sender: loggedInUser,
    deliveredTo: [loggedInUser],
  };

  // handle call event message
  if (callEvent && callEvent.type) {
    // create a single document for callEvent message
    messagesToInsert.push({
      ...commonMessageFields,
      type: "call_event",
      callEvent: {
        type: callEvent.type,
        callType: callEvent.type,
        callDuration: callEvent.callDuration || 0,
      },
    });
  }

  // handle text message
  if (text && text.trim().length > 0) {
    // create the single document for the text messsage
    messagesToInsert.push({
      ...commonMessageFields,
      text,
      type: "text",
      repliedToID,
    });
  }

  // Handle media messages, one document per each media item for individual replies
  if (media && media.length > 0) {
    media.forEach((mediaItem) => {
      // store all the mediaItem into an array
      const mediaArray = [mediaItem];

      // create single document for each mediaItem
      messagesToInsert.push({
        ...commonMessageFields,
        media: mediaArray,
        type: mediaArray[0].mediaType,
      });
    });
  }

  // check if the messageToInsert array is not empty
  if (messagesToInsert.length === 0) {
    return next(new sendErrorMiddleware("You cannot send an empty message"));
  }

  // create the message by insertMany
  const newMessages = await Message.insertMany(messagesToInsert);

  // extract the last message from the newMessages array
  const lastMessage = newMessages[newMessages.length - 1];

  // update the conversation lastmessage
  await Conversation.findByIdAndUpdate(conversationId, {
    lastMessage: lastMessage._id,
  });

  // manually populate the sender and repliedToID
  const populatePromises = newMessages.map((msg) =>
    msg.populate([
      {
        path: "sender",
        select: "name email photo",
      },
      {
        path: "repliedToID",
        select: "sender text media type",
      },
    ]),
  );

  // store the populated messages into a variable
  const populatedMessages = await Promise.all(populatePromises);

  // send response to user
  res.status(201).json({
    status: "success",
    results: populatedMessages.length,
    message: "message successfully sent",
    data: populatedMessages,
  });
});

// get all messsages for a specific conversation
exports.getAllConversationMessages = catchAsync(async (req, res, next) => {
  // store the logged in user into a variable
  const loggedInUser = req.user.id;

  // get the conversation id from the request parameters
  const { conversationId } = req.params;

  // check if the conversation exists and includes the logged in user
  const conversation = await Conversation.findOne({
    _id: conversationId,
    participants: { $in: [loggedInUser] },
  });

  if (!conversation) {
    return next(
      new sendErrorMiddleware(
        "Conversation not found or you not include in this conversation",
        404,
      ),
    );
  }

  // mark all  messages as delivered and read by the logged in user
  await Message.updateMany(
    {
      conversation: conversationId,
      $or: [
        { deliveredTo: { $ne: loggedInUser } },
        { readBy: { $ne: loggedInUser } },
      ],
    },
    {
      $addToSet: {
        deliveredTo: loggedInUser,
        readBy: loggedInUser,
      },
    },
  );

  // find the last cleared timestamp for the logged in user
  const userLastClearedTimestamp = conversation.lastClearedTimestamps.find(
    (el) => el.user.toString() === loggedInUser,
  )?.timestamps;

  // create a query variable to be able to find all the messages based on the query
  const query = { conversation: conversationId, isDeleted: false };

  // if the logged in user has a cleared timestamp, modify the query to get all the messages after the cleared timestamp
  if (userLastClearedTimestamp) {
    query.createdAt = { $gt: userLastClearedTimestamp };
  }

  // use the ApiFeatures to filter, limit field, sort and paginate conversation messages data
  const features = new ApiFeatures(
    req.query,
    Message.find(query)
      .populate("sender", "name photo email")
      .sort({ createdAt: -1 }),
  )
    .filter()
    .limitFields()
    .pagination();

  // find all messages for the conversation
  const allMessages = await features.query;

  // set isMessageOwner property on each conversation message
  const messages = allMessages.map((message) => {
    // convert each message for mongodb document into javaScript object
    const messageObject = message.toObject();

    // add isMessageOwner property to message object dynamically
    messageObject.isMessageOwner =
      messageObject.sender._id.toString() === loggedInUser;

    // return the message object
    return messageObject;
  });

  // send response to user
  res.status(200).json({
    status: "success",
    results: messages.length,
    data: messages,
  });
});

// clear conversation messages for the logged in user
exports.clearConversationMessages = catchAsync(async (req, res, next) => {
  // get the conversation id from the request parameters
  const { conversationId } = req.params;

  // store the logged in user into a variable
  const loggedInUser = req.user.id;

  // check if the conversation exists and includes the logged in user
  const conversation = await Conversation.findOne({
    _id: conversationId,
    participants: { $in: [loggedInUser] },
  });

  if (!conversation) {
    return next(
      new sendErrorMiddleware(
        "Conversation not found or you not include in this conversation",
        404,
      ),
    );
  }

  // find if the user has a timestamp already
  const userTimestampsExists = conversation.lastClearedTimestamps.find(
    (el) => el.user.toString() === loggedInUser,
  );

  // Build the updated conversation based on the user's status
  let updatedConversation;

  if (userTimestampsExists) {
    // if the user has timestamp update it using $set operator with arrayFilters and also add the logged in user to hiddenConversations array using $addToSet operator
    updatedConversation = await Conversation.findByIdAndUpdate(
      conversationId,
      { $set: { "lastClearedTimestamps.$[elem].timestamps": new Date() } },
      { $addToSet: { hiddenConversations: loggedInUser } },
      {
        new: true,
        runValidators: true,
        // arrayFilters are needed for the $set operator to find the correct element
        arrayFilters: [{ "elem.user": loggedInUser }], //
      },
    );
  } else {
    // if the user don't have timestamps push a new one into the lastClearedTimestamps array and also add the logged in user to hiddenConversations array using $addToSet operator
    updatedConversation = await Conversation.findByIdAndUpdate(
      conversationId,
      {
        $push: {
          lastClearedTimestamps: { user: loggedInUser, timestamps: new Date() },
        },
      },
      {
        $addToSet: { hiddenConversations: loggedInUser },
      },
      {
        new: true,
        runValidators: true,
      },
    );
  }

  // send response to user
  res.status(200).json({
    status: "success",
    message: "Conversation history cleared for this user",
    data: {
      lastClearedTimestamps: updatedConversation.lastClearedTimestamps,
    },
  });
});

// mark message as read by the logged in user
exports.markMessageAsRead = catchAsync(async (req, res, next) => {
  // get the message id from the request parameters
  const { messageId } = req.params;

  // store the logged in user into a variable
  const loggedInUser = req.user.id;

  // update the readBy and deliverTo field
  const updatedMessage = await Message.findByIdAndUpdate(
    messageId,
    {
      $addToSet: {
        readBy: loggedInUser,
        deliveredTo: loggedInUser,
      },
    },
    {
      new: true,
      runValidators: true,
    },
  );

  // check if the message exists
  if (!updatedMessage) {
    return next(new sendErrorMiddleware("Message not found", 404));
  }

  // check if the logged in user is a participant of the conversation
  const conversation = await Conversation.findOne({
    _id: updatedMessage.conversation,
    participants: { $in: [loggedInUser] },
  });

  if (!conversation) {
    return next(
      new sendErrorMiddleware(
        "You are not a participant of this conversation or this conversation does not exist",
        403,
      ),
    );
  }

  // send response to user
  res.status(200).json({
    status: "success",
    message: "message marked as read",
  });
});

// add reaction to a message
exports.addReactionToMessage = catchAsync(async (req, res, next) => {
  // get the message id from the request parameters
  const { messageId } = req.params;

  // store the logged in user into a variable
  const loggedInUser = req.user.id;

  // destructure the request body
  const { emoji } = req.body;

  // start a transaction to ensure atomicity
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // find the message by id
    const message = await Message.findById(messageId);

    // check if the message exists
    if (!message) {
      return next(new sendErrorMiddleware("Message not found", 404));
    }

    // check if the logged in user is a participant of the conversation
    const conversation = await Conversation.findOne({
      _id: message.conversation,
      participants: { $in: [loggedInUser] },
    });

    if (!conversation) {
      return next(
        new sendErrorMiddleware(
          "You are not a participant of this conversation or this conversation does not exist",
          403,
        ),
      );
    }

    // check if the logged in user has already reacted to the message
    const existingReactionIndex = message.reactions.findIndex(
      (reaction) => reaction.user.toString() === loggedInUser,
    );

    // create an update logis
    let updateQuery;

    // Conditional logic based on whether an existing reaction emoji is found
    if (existingReactionIndex > -1) {
      // check if the emoji is the same as the existing reaction
      if (message.reactions[existingReactionIndex].emoji === emoji) {
        // delete the reaction if the emoji is the same
        updateQuery = { $pull: { reactions: { user: loggedInUser } } };
      } else {
        // if the user has already reacted, update the emoji
        updateQuery = {
          $set: {
            [`reactions.${existingReactionIndex}.emoji`]: emoji,
          },
        };
      }
    } else {
      // if the user has not reacted, add a new reaction
      updateQuery = {
        $push: {
          reactions: { user: loggedInUser, emoji },
        },
      };
    }

    // perform the update and get modified document
    const updatedMessage = await Message.findByIdAndUpdate(
      messageId,
      updateQuery,
      {
        new: true,
        runValidators: true,
        session,
      },
    );

    // commit the transaction
    await session.commitTransaction();
    session.endSession();

    // send response to user
    res.status(200).json({
      status: "success",
      message: "reaction added to message",
      data: { reactions: updatedMessage.reactions },
    });
  } catch (err) {
    // Rollback the transaction in case of any error
    await session.abortTransaction();
    session.endSession();
    console.error("Error adding/removing reaction:", err);
    return next(new sendErrorMiddleware(`Error processing reaction: ${err}`));
  }
});

// get all reactions for a message
exports.getAllReactionsForMessage = catchAsync(async (req, res, next) => {
  // get the message id from the request parameters
  const { messageId } = req.params;

  // store the logged in user into a variable
  const loggedInUser = req.user.id;

  // find the message by id
  const message = await Message.findById(messageId).populate(
    "reactions.user",
    "name photo",
  );

  // check if the message exists
  if (!message) {
    return next(new sendErrorMiddleware("Message not found", 404));
  }

  // check if the logged in user is a participant of the conversation
  const conversation = await Conversation.findOne({
    _id: message.conversation,
    participants: { $in: [loggedInUser] },
  });

  if (!conversation) {
    return next(
      new sendErrorMiddleware(
        "You are not a participant of this conversation or this conversation does not exist",
        403,
      ),
    );
  }

  // set isEmojiOwner to true for reactions made by the logged in user
  const reactions = message.reactions.map((reaction) => {
    const reactionObject = reaction.toObject();

    reactionObject.isEmojiOwner =
      reactionObject.user._id.toString() === loggedInUser;

    return reactionObject;
  });

  // send response to user
  res.status(200).json({
    status: "success",
    results: reactions.length,
    data: reactions,
  });
});

// remove reaction from a message
exports.removeReactionFromMessage = catchAsync(async (req, res, next) => {
  // get the message id from the request parameters
  const { messageId } = req.params;

  // store the logged in user into a variable
  const loggedInUser = req.user.id;

  // find the message by id
  const message = await Message.findById(messageId);

  // check if the message exists
  if (!message) {
    return next(new sendErrorMiddleware("Message not found", 404));
  }

  // check if the logged in user is a participant of the conversation
  const conversation = await Conversation.findOne({
    _id: message.conversation,
    participants: { $in: [loggedInUser] },
  });

  if (!conversation) {
    return next(
      new sendErrorMiddleware(
        "You are not a participant of this conversation or this conversation does not exist",
        403,
      ),
    );
  }

  // find the message and remove it's emoji
  const updatedMessage = await Message.findByIdAndUpdate(
    messageId,
    {
      $pull: { reactions: { user: loggedInUser } },
    },
    { new: true, runValidators: true },
  );

  // send response to user
  res.status(200).json({
    status: "success",
    message: "reaction removed from message",
    data: { reactions: updatedMessage.reactions },
  });
});

// forward message(s) into diffirent conversation
exports.forwardMessages = catchAsync(async (req, res, next) => {
  // store the logged in user into variable
  const loggedInUser = req.user.id;

  // destructuring the req.body by getting the message and conversation ids array
  const { messageIds, conversationIds } = req.body;

  // check if the user pass the message(s) they want to broadcast and the conversation they want to broadcast it to
  if (!messageIds?.length || !conversationIds?.length) {
    return next(
      new sendErrorMiddleware(
        "Please provide the message(s) you want to forward and which conversation you're broadcasting it to",
        404,
      ),
    );
  }

  // get the original message(s) and filter out the message which has type of call_event
  const originalMessages = await Message.find({
    _id: { $in: messageIds },
    type: { $ne: "call_event" },
  }).select("text type media");

  // check if the originalMessages array is not empty
  if (originalMessages.length === 0) {
    return next(
      new sendErrorMiddleware("You don't have any messages to be forward", 400),
    );
  }

  // get all the conversation(s) which id is present in the conversationIds array and the logged in user must be a participant in the all the conversation
  const conversationReceivedForwardMessages = await Conversation.find({
    _id: { $in: conversationIds },
    participants: { $in: [loggedInUser] }, // to make sure the logged in user is a participant in all the conversation been fetched
  }).select("_id");

  // check if the length of the coversation to received forwarded message is equal to the conversationIds
  if (conversationReceivedForwardMessages.length !== conversationIds.length) {
    return next(
      new sendErrorMiddleware(
        "You are a participant in one of the conversation, you can only forward message to conversation you are part of",
        404,
      ),
    );
  }

  // create batch forward messages to be inserted
  const forwardMessagesToInsert = [];

  // loop through each conversation received forward messages and nestedly loop through each original message to create the message object to be inserted
  for (const conversation of conversationReceivedForwardMessages) {
    for (const originalMessage of originalMessages) {
      // map original message fields to new message fields
      const newForwardMessage = {
        conversation: conversation._id,
        sender: loggedInUser,
        deliveredTo: [loggedInUser],
        text: originalMessage.text || null,
        repliedToID: originalMessage.repliedToID || null,
        media: originalMessage.media,
        type: originalMessage.type,
        isForward: true,
      };

      // push the new forward message into the forwardMessagesToInsert array
      forwardMessagesToInsert.push(newForwardMessage);
    }
  }

  // insert the forward messages using insertMany
  const newForwardMessages = await Message.insertMany(forwardMessagesToInsert);

  // populate the sender field of each new forward message, using Populate static method
  const poppulatedForwardMessages = await Message.populate(newForwardMessages, [
    {
      path: "sender",
      select: "name email photo",
    },
    {
      path: "repliedToID",
      select: "sender text media type",
    },
  ]);

  // create an object to hold the conversation id as key and message as value
  const lastMessagesPerConversation = {};

  // loop through each new forward messages to get the last message for each conversation
  newForwardMessages.forEach((msg) => {
    lastMessagesPerConversation[msg.conversation] = msg;
  });

  // update each conversation last message using the lastMessagesPerConversation object
  const conversationUpdatePromises = conversationReceivedForwardMessages.map(
    async (conversation) => {
      // select the last message for each conversation from the lastMessagesPerConversation object
      const lastMessage = lastMessagesPerConversation[conversation._id];

      // check if the last message exists before updating the conversation
      if (lastMessage) {
        return await Conversation.updateOne(
          {
            _id: conversation._id,
          },
          {
            lastMessage: lastMessage._id,
          },
        ).exec();
      }

      // if there is no update to be made return Promise.resolve()
      return Promise.resolve();
    },
  );

  // await on all the conversation update promises to be resolved
  await Promise.all(conversationUpdatePromises);

  // send response to user
  res.status(201).json({
    status: "success",
    results: poppulatedForwardMessages.length,
    message: `${poppulatedForwardMessages.length} message(s) successfully forwarded to ${conversationReceivedForwardMessages.length} conversation(s)`,
    data: poppulatedForwardMessages,
  });
});

// delete a message
exports.deleteMessage = catchAsync(async (req, res, next) => {
  // get the message id from the request parameters
  const { messageId } = req.params;

  // store the logged in user into a variable
  const loggedInUser = req.user.id;

  // start transaction atomicity
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // find the message by id
    const message = await Message.findById(messageId).session(session);

    // check if the message exists, if the message does exists abort the transaction
    if (!message) {
      await session.abortTransaction();
      session.endSession();
      return next(new sendErrorMiddleware("Message not found", 404));
    }

    // check if the logged in user is the sender of the message, if the logged in user is not the owner of the message abort the transaction
    if (message.sender._id.toString() !== loggedInUser) {
      await session.abortTransaction();
      session.endSession();
      return next(
        new sendErrorMiddleware("You are not the sender of this message", 403),
      );
    }

    // remove the message from the database
    const updatedMessage = await Message.findByIdAndUpdate(
      messageId,
      { $set: { isDeleted: true } },
      { new: true, runValidators: true, session },
    );

    // find the conversation by id
    const conversation = await Conversation.findById(
      updatedMessage.conversation,
    ).session(session);

    // update the conversation lastmessage field if the deleted message was the last message
    if (
      conversation &&
      conversation.lastMessage &&
      conversation.lastMessage.toString() === messageId
    ) {
      const newLastMessage = await Message.findOne({
        conversation: conversation._id,
        isDeleted: false,
      })
        .sort({ createdAt: -1 })
        .select("_id")
        .session(session);

      conversation.lastMessage = newLastMessage ? newLastMessage._id : null;
      await conversation.save({ session });
    }

    // Commits the transaction if all the operations is successfull
    await session.commitTransaction();
    session.endSession();
  } catch (err) {
    // Rollback the transaction in case of any error
    await session.abortTransaction();
    session.endSession();
    return next(new sendErrorMiddleware(`Error deleting message: ${err}`));
  }

  // send response to user
  res.status(204).json({
    status: "success",
    data: null,
  });
});
