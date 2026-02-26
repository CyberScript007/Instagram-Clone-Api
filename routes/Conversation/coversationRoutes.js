const express = require("express");
const ConversationController = require("../../Controller/Conversation/ConversationController");
const AuthController = require("../../Controller/AuthController");
const messageRoutes = require("./messageRoutes");

const router = express.Router();

// nested routes
router.use("/:conversationId", messageRoutes);

router.use(AuthController.protectedRoute);

router
  .route("/")
  .get(ConversationController.getAllConversations)
  .post(ConversationController.createConversation);

router.get(
  "/:conversationId/details",
  ConversationController.getConversationDetails
);

router.patch(
  "/:conversationId/make-admin",
  ConversationController.makeMemberGroupAdmin
);

router.patch(
  "/:conversationId/remove-admin",
  ConversationController.removeGroupAdmin
);

router.patch(
  "/:conversationId/add-member",
  ConversationController.addMemberToGroup
);

router.patch(
  "/:conversationId/remove-member",
  ConversationController.removeMemberFromGroup
);

router.patch(
  "/:conversationId/leave",
  ConversationController.leaveGroupConversation
);

module.exports = router;
