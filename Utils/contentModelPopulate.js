const Post = require("../Models/Post/postModel");
const PostComments = require("../Models/Post/PostComment/postCommentModel");
const PostCommentReply = require("../Models/Post/PostCommentReply/postCommentReplyModel");
const User = require("../Models/userModel");
const Message = require("../Models/Conversation/messageModel");

const contentModelPopulateFunc = async function (contentType) {
  try {
    let contentModel;
    let populateField;

    switch (contentType) {
      case "post":
        contentModel = Post;
        populateField = "user";
        break;

      case "comment":
        contentModel = PostComments;
        populateField = "user post";
        break;

      case "reply":
        contentModel = PostCommentReply;
        populateField = "user postComment";
        break;

      case "message":
        contentModel = Message;
        populateField = "sender";

      case "user":
        contentModel = User;
        populateField = null; // No additional fields to populate for user
        break;

      default:
        throw new Error("Invalid content type");
    }

    return { contentModel, populateField };
  } catch (err) {
    throw err;
  }
};

module.exports = contentModelPopulateFunc;
