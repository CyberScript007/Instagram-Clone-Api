const Post = require("../Models/Post/postModel");
const PostComments = require("../Models/Post/PostComment/postCommentModel");
const PostCommentReply = require("../Models/Post/PostCommentReply/postCommentReplyModel");
const Messsage = require("../Models/Conversation/messageModel");
const User = require("../Models/userModel");

const contentModelFunc = async function (contentType) {
  try {
    let contentModel;

    switch (contentType) {
      case "post":
        contentModel = Post;
        break;

      case "comment":
        contentModel = PostComments;
        break;

      case "reply":
        contentModel = PostCommentReply;
        break;

      case "message":
        contentModel = Messsage;
        break;

      case "user":
        contentModel = User;
        break;

      default:
        throw new Error("Invalid content type");
    }

    return contentModel;
  } catch (err) {
    throw err;
  }
};

module.exports = contentModelFunc;
