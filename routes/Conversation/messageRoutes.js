const express = require("express");
const MessageController = require("../../Controller/Conversation/MessageController");
const AuthController = require("../../Controller/AuthController");
const uploadMessagesMiddleware = require("../../Utils/uploadMessagesMiddleware");

const router = express.Router({ mergeParams: true });

router.use(AuthController.protectedRoute);

router
  .route("/message")
  .get(MessageController.getAllConversationMessages)
  .post(
    uploadMessagesMiddleware.array("media", 15),
    MessageController.processMessageMedia,
    MessageController.sendMessage
  );

router.post("/forward", MessageController.forwardMessages);

router.post("/clear", MessageController.clearConversationMessages);

router.patch("/:messageId/read", MessageController.markMessageAsRead);

router
  .route("/:messageId/reactions")
  .get(MessageController.getAllReactionsForMessage);

router.patch("/:messageId/addReaction", MessageController.addReactionToMessage);
router.patch(
  "/:messageId/removeReaction",
  MessageController.removeReactionFromMessage
);

router.delete("/:messageId", MessageController.deleteMessage);

module.exports = router;
