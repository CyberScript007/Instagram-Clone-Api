const mongoose = require("mongoose");
const Conversation = require("../../Models/Conversation/conversationModel");
const Message = require("../../Models/Conversation/messageModel");
const User = require("../../Models/userModel");
const catchAsync = require("../../Utils/catchAsync");
const sendErrorMiddleware = require("../../Utils/sendErrorMiddleware");
const determineMessageType = require("../../Utils/determineMessageType");

exports.createConversation = catchAsync(async (req, res, next) => {
  // store the logged in user into a variable
  const loggedInUser = req.user.id;

  // destructure the reque
  const { participants, groupName, groupPhoto } = req.body;

  // check if the participants array includes the logged in user
  if (!participants.includes(loggedInUser)) {
    participants.push(loggedInUser);
  }

  // check if the participants array has at least 2 users
  if (participants.length < 2) {
    return next(
      new sendErrorMiddleware(
        "A conversation must have at least 2 participants",
        400,
      ),
    );
  }

  // verify if all the users participant exist in user collection
  const existingUsers = await User.find({ _id: { $in: participants } })
    .select("_id")
    .lean();

  if (existingUsers.length !== participants.length) {
    return next(
      new sendErrorMiddleware("One or more participants do not exist", 400),
    );
  }

  // set isGroupChat to true if participants are more than 2 and false if exactly 2
  const isGroup = participants.length > 2 ? true : false;

  // check if a conversation already exists with the same participants (for non-group chats)
  if (!isGroup && participants.length === 2) {
    const existingConversation = await Conversation.findOne({
      isGroupChat: false,
      participants: { $all: participants, $size: 2 },
    });

    if (existingConversation) {
      return res.status(200).json({
        status: "success",
        message: "Conversation already exists, returning existing conversation",
        data: existingConversation,
      });
    }
  }

  // set group name to all the users name joined by comma if not provided and isGroupChat is true
  let group_Name = groupName;
  if (isGroup && !groupName) {
    const userNames = await User.find({ _id: { $in: participants } })
      .select("name")
      .lean();
    group_Name = userNames.map((user) => user.name).join(", ");
  }

  // get the first two users photo as the group photo if not provided and isGroupChat is true
  let group_Photo = groupPhoto;
  if (isGroup && !groupPhoto) {
    const userPhotos = await User.find({ _id: { $in: participants } })
      .select("photo")
      .lean();
    group_Photo = userPhotos.slice(0, 2).map((user) => user.photo);
  }

  // use the logged in user as the group admin if isGroup is true
  const groupAdmin = isGroup ? [loggedInUser] : [];

  // create the conversation
  const newConversation = await Conversation.create({
    participants,
    isGroupChat: isGroup,
    groupName: group_Name,
    groupPhoto: group_Photo,
    groupAdmins: groupAdmin,
  });

  // populate the participants and groupAdmin fields
  const conversation = await Conversation.findById(newConversation._id)
    .populate("participants", "name photo email")
    .populate("groupAdmins", "name photo email");

  // send response to user
  res.status(201).json({
    status: "success",
    message: "conversation successfully created",
    data: conversation,
  });
});

// get all conversations for the logged in user
exports.getAllConversations = catchAsync(async (req, res, next) => {
  // store the logged in user into a variable
  const loggedInUser = req.user.id;

  // convert the logged in user id into a mongoose object id
  const loggedInUserId =
    mongoose.Types.ObjectId.createFromHexString(loggedInUser);

  // make the copy of the request query
  const queryObj = { ...req.query };

  // fields to exclude from the query
  const excludedFields = ["page", "sort", "limit", "fields"];
  excludedFields.forEach((el) => delete queryObj[el]);

  // build the dynamic filter object
  let filterMatch = {};

  for (const [key, value] of Object.entries(queryObj)) {
    // if the value is a valid ObjectId string, convert it
    if (mongoose.Types.ObjectId.isValid(value)) {
      filterMatch[key] = mongoose.Types.ObjectId.createFromHexString(value);
    } else if (value === "true" || value === "false") {
      // Handle boolean value
      filterMatch[key] = value === "true";
    } else {
      // For all other types, add key/value as it is
      filterMatch[key] = value;
    }
  }

  const pipeline = [
    // Stage 1: The combined $match stage for both the user and dynamic filters
    // This is the most efficient approach as it filters the documents early.
    {
      $match: {
        participants: { $in: [loggedInUserId] },
        ...filterMatch, // spread the dynamic filters here
      },
    },

    // Stage 2: Look up and join the last message details
    {
      $lookup: {
        from: "messages",
        localField: "lastMessage",
        foreignField: "_id",
        as: "lastMessage",
      },
    },
    // Stage 3: Look up and join the participants data
    {
      $lookup: {
        from: "users",
        localField: "participants",
        foreignField: "_id",
        as: "participants",
      },
    },

    // Stage 4: Look up and join the group admin's data
    {
      $lookup: {
        from: "users",
        localField: "groupAdmins",
        foreignField: "_id",
        as: "groupAdmins",
      },
    },
    // Stage 5: Convert the arrays created by $lookup operation into a single object
    {
      $addFields: {
        lastMessage: { $arrayElemAt: ["$lastMessage", 0] },
      },
    },
    // Stage 6: Look up and populate the sender details within the lastMessage
    {
      $lookup: {
        from: "users",
        localField: "lastMessage.sender",
        foreignField: "_id",
        as: "lastMessage.sender",
      },
    },
    // Stage 7: Convert the sender array into a single object
    {
      $addFields: {
        "lastMessage.sender": { $arrayElemAt: ["$lastMessage.sender", 0] },
      },
    },
    // Stage 8: Add isAdmin field to each participants
    {
      $addFields: {
        participants: {
          $map: {
            input: "$participants",
            as: "participant",
            in: {
              $mergeObjects: [
                "$$participant",
                {
                  isAdmin: { $in: ["$$participant._id", "$groupAdmins._id"] },
                },
              ],
            },
          },
        },
      },
    },
    // Stage 9: Apply the conditional logic to set the lastMessage filed
    {
      $addFields: {
        lastMessage: {
          // use the $cond operator to be able to have access to if-then-else statement
          $cond: {
            // use the if statement to check the condition the lastMessage must meet
            if: {
              // using the $and to make sure all the condition in the if statement is true otherwise it will be false
              $and: [
                // check if the lastMessage field is not equals to null
                { $ne: ["$lastMessage", null] },
                // check if the lastMessage.createdAt field is less than or equals to conversation lastClearedTimestamps field
                {
                  $lte: [
                    "$lastMessage.createdAt",
                    {
                      // use to select the lastClearedTimestamps.timestamps of user which is lastClearedTimestamp.user is equals to loggedINUserId
                      $arrayElemAt: [
                        "$lastClearedTimestamps.timestamps",
                        {
                          $indexOfArray: [
                            "$lastClearedTimestamps.user",
                            loggedInUserId,
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            // if all the condition in the if statement is true then set the lastMessage field to null
            then: null,
            // if the condition in the if  statement is false, don't modify the lastMessage field
            else: "$lastMessage",
          },
        },
      },
    },
    // Stage 10: Limit the field on nested object for efficiency
    // This stage reduces the document size before the final sorting and pagination
    {
      $project: {
        // keep the conversation fields
        _id: 1,
        isGroupChat: 1,
        groupName: 1,
        groupPhoto: 1,
        updatedAt: 1,
        lastClearedTimestamps: 1,
        // Only return essential fields for the last message
        "lastMessage.text": 1,
        "lastMessage.createdAt": 1,
        // Only return essential fields for the last message sender
        "lastMessage.sender.name": 1,
        "lastMessage.sender.photo": 1,
        // The participants array for group chats is not needed in the list view.
        // For direct messages, we still need the participants to identify the other user.
        participantName: {
          $cond: {
            if: "$isGroupChat",
            then: "$groupName",
            else: {
              $arrayElemAt: [
                "$participants.name",
                {
                  $indexOfArray: [
                    "$participants._id",
                    { $not: [loggedInUserId] },
                  ],
                },
              ],
            },
          },
        },
        participantPhoto: {
          $cond: {
            if: "$isGroupChat",
            then: { $slice: ["$participants.photo", 2] },
            else: {
              $arrayElemAt: [
                "$participants.photo",
                {
                  $indexOfArray: [
                    "$participants._id",
                    { $not: [loggedInUserId] },
                  ],
                },
              ],
            },
          },
        },
      },
    },
  ];

  // Replicate the ApiFeatures for Sorting for multiple field (e.g., /api/conversations?sort=-updatedAt,participants) using aggregation pipeline,
  // assign the sort query variable by updatedAt in  descending order if the user don't pass any field to sort the documents with
  const sortQuery = req.query.sort || "-updatedAt";
  // split the query by commas, by splitting the query by comma the sortFields will contains array of the query been split
  const sortFields = sortQuery.split(",");
  const sortStage = {};

  // loop through the sortFields array
  sortFields.forEach((field) => {
    // remove white space from the field
    const trimmedField = field.trim();

    // check if the trimmed field startsWith hypen
    if (trimmedField.startsWith("-")) {
      // if the condition is true remove the hypen and only select the remaining string
      const fieldName = trimmedField.substring(1);
      // use the field name to create object key inside sortStage object and assign -1 as the value (sorting in descending order)
      sortStage[fieldName] = -1;
    } else {
      // create the key with the trimmed field value and assign 1 to it (sorting in ascending order)
      sortStage[trimmedField] = 1;
    }
  });

  // push the sortStage object into aggregation pipeline
  pipeline.push({ $sort: sortStage });

  // Replicate the ApiFeatures for Limiting fields (e.g., /api/conversations?fields=name,lastMessage) using aggregation pipeline,
  // check if the user pass in the field they want to include in the output
  if (req.query.fields) {
    // split the fields by comma and loop through it to only include the fields that the user pass in as a parameters
    const fields = req.query.fields.split(",").reduce((acc, field) => {
      acc[field.trim()] = 1;
      return acc;
    }, {});

    // also include the conversation _id
    fields._id = 1;

    // push the limit fields into the pipeline
    pipeline.push({ $project: fields });
  }

  // Replicate the ApiFeatures for Pagination (e.g., /api/conversations?page=1&limit=10) using aggregation pipeline.
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;

  // calculate the page number it should be display and the number of data that should be display in that page
  const skip = (page - 1) * limit;

  // push both skip and limit variable into the pipeline
  pipeline.push({ $skip: skip });
  pipeline.push({ $limit: limit });

  // Execute the final aggregation pipeline
  const conversations = await Conversation.aggregate(pipeline);

  // send response to user
  res.status(200).json({
    status: "success",
    results: conversations.length,
    data: conversations,
  });
});

// get a conversation details
exports.getConversationDetails = catchAsync(async (req, res, next) => {
  // store the conversation id into a variable by destructuring request parameter
  const { conversationId } = req.params;

  // store the logged in user into a variable
  const loggedInUser = req.user.id;

  // convert the logged in user id and conversation id into mongoose object id
  const userId = mongoose.Types.ObjectId.createFromHexString(loggedInUser);
  const conversationObjectId =
    mongoose.Types.ObjectId.createFromHexString(conversationId);

  const pipeline = [
    // Stage 1: Match the conversation by ID and check if the user is a participant.
    {
      $match: {
        _id: conversationObjectId,
        participants: { $in: [userId] },
      },
    },
    // Stage 2: Look up and join the last message details.
    {
      $lookup: {
        from: "messages",
        localField: "lastMessage",
        foreignField: "_id",
        as: "lastMessage",
      },
    },
    // Stage 3: Look up and join the participants' data.
    {
      $lookup: {
        from: "users",
        localField: "participants",
        foreignField: "_id",
        as: "participants",
      },
    },
    // Stage 4: Look up and join the group admin's data.
    {
      $lookup: {
        from: "users",
        localField: "groupAdmins",
        foreignField: "_id",
        as: "groupAdmins",
      },
    },
    // Stage 5: Convert the arrays created by $lookup into single objects.
    {
      $addFields: {
        lastMessage: { $arrayElemAt: ["$lastMessage", 0] },
      },
    },
    // Stage 6: Now, populate the 'sender' field of the lastMessage.
    {
      $lookup: {
        from: "users",
        localField: "lastMessage.sender",
        foreignField: "_id",
        as: "lastMessage.sender",
      },
    },
    // Stage 7: Convert the sender array into a single object
    {
      $addFields: {
        "lastMessage.sender": { $arrayElemAt: ["$lastMessage.sender", 0] },
      },
    },
    // Stage 8: Add isAdmin field to each participants
    {
      $addFields: {
        participants: {
          $map: {
            input: "$participants",
            as: "participant",
            in: {
              $mergeObjects: [
                "$$participant",
                {
                  isAdmin: { $in: ["$$participant._id", "$groupAdmins._id"] },
                },
              ],
            },
          },
        },
      },
    },
    // Stage 9: Apply the conditional logic to the last message field
    {
      $addFields: {
        lastMessage: {
          $cond: {
            if: {
              $and: [
                { $ne: ["$lastMessage", null] },
                {
                  $lte: [
                    "$lastMessage.createdAt",
                    {
                      $arrayElemAt: [
                        "$lastClearedTimestamps.timestamps",
                        {
                          $indexOfArray: [
                            "$lastClearedTimestamps.user",
                            userId,
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            then: null,
            else: "$lastMessage",
          },
        },
      },
    },
    // Stage 10: Limit the fields to be returned.
    {
      $project: {
        // Main conversation fields
        _id: 1,
        isGroupChat: 1,
        groupName: 1,
        groupPhoto: 1,
        updatedAt: 1,
        createdAt: 1,

        // Participants fields
        "participants._id": 1,
        "participants.name": 1,
        "participants.photo": 1,
        "participants.email": 1,
        "participants.accountStatus": 1,
        "participants.isAdmin": 1,

        // Last message and its sender fields
        "lastMessage._id": 1,
        "lastMessage.text": 1,
        "lastMessage.type": 1,
        "lastMessage.createdAt": 1,
        "lastMessage.sender._id": 1,
        "lastMessage.sender.name": 1,
        "lastMessage.sender.photo": 1,
        "lastMessage.sender.email": 1,
        "lastMessage.sender.accountStatus": 1,

        // Group admin fields
        "groupAdmins._id": 1,
        "groupAdmins.name": 1,
        "groupAdmins.photo": 1,
        "groupAdmins.email": 1,
        "groupAdmins.accountStatus": 1,

        // Also include the timestamps field to correctly filter the messages on the client side
        lastClearedTimestamps: 1,
      },
    },
  ];

  // de
  const [conversation] = await Conversation.aggregate(pipeline);
  if (!conversation) {
    return next(
      new sendErrorMiddleware(
        "Conversation not found or you are not included in this conversation",
        404,
      ),
    );
  }

  // send response to user
  res.status(200).json({
    status: "success",
    data: {
      conversation,
    },
  });
});

// Make a member admin in a group chat
exports.makeMemberGroupAdmin = catchAsync(async (req, res, next) => {
  // get the conversation id from the request parameters
  const { conversationId } = req.params;

  // store the logged in user into a variable
  const loggedInUser = req.user.id;

  // destructure the request body
  const { userId } = req.body;

  // check if the conversation exists and if the logged in user is a group admin
  const conversation = await Conversation.findOne({
    _id: conversationId,
    groupAdmins: { $in: [loggedInUser] },
    isGroupChat: true,
    participants: { $in: [userId] },
  });

  if (!conversation) {
    return next(
      new sendErrorMiddleware(
        "Conversation not found, or you are not an admin, or the user is not a participant. Only group admin can make a member an admin",
        404,
      ),
    );
  }

  // Add the user to the groupAdmins array using $addToSet to prevent duplicates
  const updatedConversation = await Conversation.findByIdAndUpdate(
    conversationId,
    { $addToSet: { groupAdmins: userId } },
    { new: true, runValidators: true },
  );

  if (!updatedConversation) {
    return next(
      new sendErrorMiddleware("Failed to update the group admin", 500),
    );
  }

  // send response to user
  res.status(200).json({
    status: "success",
    message: "User successfully made group admin",
    data: updatedConversation,
  });
});

// Remove a member from admin in a group chat
exports.removeGroupAdmin = catchAsync(async (req, res, next) => {
  // get the conversation id from the request parameters
  const { conversationId } = req.params;

  // store the logged in user into a variable
  const loggedInUser = req.user.id;

  // destructure the request body
  const { userId } = req.body;

  // check if the conversation exists and if the logged in user is a group admin and the user to be removed is a participant
  const conversation = await Conversation.findOne({
    _id: conversationId,
    groupAdmins: { $in: [loggedInUser] },
    isGroupChat: true,
    participants: { $in: [userId] },
  });

  if (!conversation) {
    return next(
      new sendErrorMiddleware(
        "Conversation not found, or you are not an admin, or the user is not a participant. Only group admin can remove a member from being an admin",
        404,
      ),
    );
  }

  // check if the user to be removed is actually an admin
  if (!conversation.groupAdmins.includes(userId)) {
    return next(
      new sendErrorMiddleware("The user is not an admin in this group", 400),
    );
  }

  // Remove the user from the groupAdmins array using $pull
  const updatedConversation = await Conversation.findByIdAndUpdate(
    conversationId,
    { $pull: { groupAdmins: userId } },
    { new: true, runValidators: true },
  );

  if (!updatedConversation) {
    return next(
      new sendErrorMiddleware("Failed to update the group admin", 500),
    );
  }

  // send response to user
  res.status(200).json({
    status: "success",
    message: "User successfully removed from being a group admin",
    data: updatedConversation,
  });
});

// add a member to a group chat
exports.addMemberToGroup = catchAsync(async (req, res, next) => {
  // get the conversation id from the request parameters
  const { conversationId } = req.params;

  // store the logged in user into a variable
  const loggedInUser = req.user.id;

  // destructure the request body
  const { userId } = req.body;

  // check if the conversation exists, if the logged in user is a group admin and if the user to be added is not already a participant
  const conversation = await Conversation.findOne({
    _id: conversationId,
    groupAdmins: { $in: [loggedInUser] },
    isGroupChat: true,
    participants: { $nin: [userId] },
  });

  if (!conversation) {
    return next(
      new sendErrorMiddleware(
        "Conversation not found, or you are not an admin, or the user is already a participant. Only group admin can add a member to the group",
        404,
      ),
    );
  }

  // Add the user to the participants array using $addToSet to prevent duplicates
  const updatedConversation = await Conversation.findByIdAndUpdate(
    conversationId,
    { $addToSet: { participants: userId } },
    { new: true, runValidators: true },
  );

  if (!updatedConversation) {
    return next(
      new sendErrorMiddleware("Failed to add the member to the group", 500),
    );
  }

  // send response to user
  res.status(200).json({
    status: "success",
    message: "User successfully added to the group",
    data: updatedConversation,
  });
});

// remove a member from a group chat
exports.removeMemberFromGroup = catchAsync(async (req, res, next) => {
  // get the conversation id from the request parameters
  const { conversationId } = req.params;

  // store the logged in user into a variable
  const loggedInUser = req.user.id;

  // destructure the request body
  const { userId } = req.body;

  // check if the conversation exists and if the logged in user is a group admin and the user to be removed is a participant
  const conversation = await Conversation.findOne({
    _id: conversationId,
    groupAdmins: { $in: [loggedInUser] },
    isGroupChat: true,
    participants: { $in: [userId] },
  });

  if (!conversation) {
    return next(
      new sendErrorMiddleware(
        "Conversation not found, or you are not an admin, or the user is not a participant. Only group admin can remove a member from the group",
        404,
      ),
    );
  }

  // prevent the admin to remove themselves from the group
  if (userId === loggedInUser) {
    return next(
      new sendErrorMiddleware("You cannot remove yourself from the group", 400),
    );
  }

  // Remove the user from the participants and groupAdmins array using $pull
  const updatedConversation = await Conversation.findByIdAndUpdate(
    conversationId,
    { $pull: { participants: userId, groupAdmins: userId } },
    { new: true, runValidators: true },
  );

  if (!updatedConversation) {
    return next(
      new sendErrorMiddleware(
        "Failed to remove the member from the group",
        500,
      ),
    );
  }

  // send response to user
  res.status(200).json({
    status: "success",
    message: "User successfully removed from the group",
    data: updatedConversation,
  });
});

// leave a group chat
exports.leaveGroupConversation = catchAsync(async (req, res, next) => {
  // get the conversation id from the request parameters
  const { conversationId } = req.params;

  // store the logged in user into a variable
  const loggedInUser = req.user.id;

  // Use the $pull operator to remove the user from participants and groupAdmins array
  let updatedConversation = await Conversation.findOneAndUpdate(
    { _id: conversationId },
    {
      isGroupChat: true,
      $pull: { participants: loggedInUser, groupAdmins: loggedInUser },
    },
    { new: true, runValidators: true },
  );

  if (!updatedConversation) {
    return next(
      new sendErrorMiddleware(
        "Conversation not found or you are not a participant of this group",
        404,
      ),
    );
  }

  // check if all admins have left the group and if there are still participants in the group
  if (
    updatedConversation.groupAdmins.length === 0 &&
    updatedConversation.participants.length > 0
  ) {
    // Promote the first participant to be the group admin
    const newAdminId = updatedConversation.participants[0];

    updatedConversation = await Conversation.findByIdAndUpdate(
      conversationId,
      { $addToSet: { groupAdmins: newAdminId } },
      { new: true, runValidators: true },
    );

    // send response to user
    return res.status(200).json({
      status: "success",
      message:
        "You have left the group. Since you were the last admin, a new admin has been assigned.",
      data: updatedConversation,
    });
  }

  // check if there are no participants left in the group, if true delete the conversation
  if (updatedConversation.participants.length === 0) {
    // delete all messages associated with the conversation before deleting the conversation itself
    await Message.deleteMany({ conversation: conversationId });

    // delete the conversation
    await Conversation.findByIdAndDelete(conversationId);

    // send response to user
    return res.status(200).json({
      status: "success",
      message:
        "You have left the group. Since there are no participants left, the group has been deleted.",
    });
  }

  // send a success response to the user for normal exit
  res.status(200).json({
    status: "success",
    message: "You have successfully left the group",
    data: updatedConversation,
  });
});
