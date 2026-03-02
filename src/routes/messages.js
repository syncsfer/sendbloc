// ═══════════════════════════════════════════
// SENDBLOC — Messages Routes
// ═══════════════════════════════════════════

const { Router } = require("express");
const { Messages, Contacts, Groups, Notifications } = require("../models");
const { conversationId, generateId } = require("../utils/crypto");
const { asyncHandler, authenticate, messageLimiter, requireBody } = require("../middleware");

const router = Router();

/**
 * GET /messages/conversations
 * List all conversations with last message and unread count
 */
router.get("/conversations", authenticate, asyncHandler(async (req, res) => {
  const conversations = Messages.getConversationsList(req.user.wallet);

  res.json(conversations.map(c => ({
    conversationId: c.conversation_id,
    lastMessage: {
      content: c.content,
      type: c.type,
      fileName: c.file_name,
      voiceDuration: c.voice_duration,
      senderId: c.sender_id,
      createdAt: c.created_at,
    },
    unreadCount: c.unread_count,
  })));
}));

/**
 * GET /messages/:conversationId
 * Get messages for a conversation (paginated)
 */
router.get("/:conversationId", authenticate, asyncHandler(async (req, res) => {
  const { conversationId: convId } = req.params;
  const { before, limit } = req.query;

  const messages = Messages.getConversationPaginated(
    convId, before || null, parseInt(limit) || 50
  );

  // Mark as read
  Messages.markRead(convId, req.user.wallet);

  res.json({
    conversationId: convId,
    messages: messages.map(formatMessage),
    hasMore: messages.length === (parseInt(limit) || 50),
  });
}));

/**
 * POST /messages/send
 * Send an encrypted message (DM or group)
 */
router.post("/send", authenticate, messageLimiter, asyncHandler(async (req, res) => {
  const {
    recipientId, groupId, type, content, iv, authTag,
    fileName, fileSize, fileType, voiceDuration, replyToId,
  } = req.body;

  if (!recipientId && !groupId) {
    return res.status(400).json({ error: "recipientId or groupId required" });
  }

  const senderId = req.user.wallet;
  let convId;

  // DM
  if (recipientId) {
    const normalized = recipientId.toLowerCase();
    convId = conversationId(senderId, normalized);

    // Check if blocked
    const contact = Contacts.find(senderId, normalized);
    if (contact?.is_blocked) {
      return res.status(403).json({ error: "Contact is blocked" });
    }

    // Auto-add as contact if not exists
    if (!contact) {
      Contacts.add(senderId, normalized);
    }
  }

  // Group
  if (groupId) {
    if (!Groups.isMember(groupId, senderId)) {
      return res.status(403).json({ error: "Not a group member" });
    }
    convId = groupId;
  }

  const msgId = generateId("msg");
  const message = {
    id: msgId,
    conversationId: convId,
    senderId,
    recipientId: recipientId?.toLowerCase() || null,
    type: type || "text",
    content,
    iv,
    authTag,
    fileName,
    fileSize,
    fileType,
    voiceDuration,
    replyToId,
    reactions: [],
  };

  Messages.create(message);

  const created = Messages.getById(msgId);

  // Create notification for recipient
  if (recipientId) {
    const notifId = generateId("notif");
    Notifications.create(notifId, recipientId.toLowerCase(), "message", "New Message", content?.slice(0, 100), { messageId: msgId, senderId });
  }

  // For groups, notify all members
  if (groupId) {
    const members = Groups.getMembers(groupId);
    for (const m of members) {
      if (m.user_id !== senderId) {
        const notifId = generateId("notif");
        Notifications.create(notifId, m.user_id, "message", "New Group Message", content?.slice(0, 100), { messageId: msgId, groupId, senderId });
      }
    }
  }

  // Emit via WebSocket (handled by socket service)
  const io = req.app.get("io");
  if (io) {
    const targets = recipientId ? [recipientId.toLowerCase()] : Groups.getMembers(groupId).map(m => m.user_id).filter(id => id !== senderId);
    targets.forEach(target => {
      io.to(`wallet:${target}`).emit("message:new", formatMessage(created));
    });
  }

  res.status(201).json(formatMessage(created));
}));

/**
 * POST /messages/:messageId/read
 * Mark a message as read
 */
router.post("/:messageId/read", authenticate, asyncHandler(async (req, res) => {
  const msg = Messages.getById(req.params.messageId);
  if (!msg) return res.status(404).json({ error: "Message not found" });

  Messages.markRead(msg.conversation_id, req.user.wallet);

  // Emit read receipt via WebSocket
  const io = req.app.get("io");
  if (io && msg.sender_id !== req.user.wallet) {
    io.to(`wallet:${msg.sender_id}`).emit("message:read", {
      conversationId: msg.conversation_id,
      readBy: req.user.wallet,
    });
  }

  res.json({ success: true });
}));

/**
 * POST /messages/:messageId/deliver
 * Mark messages as delivered
 */
router.post("/deliver", authenticate, asyncHandler(async (req, res) => {
  const { messageIds } = req.body;
  if (!Array.isArray(messageIds)) return res.status(400).json({ error: "messageIds must be an array" });

  Messages.markDelivered(messageIds);
  res.json({ success: true });
}));

/**
 * POST /messages/:messageId/reaction
 * Toggle a reaction on a message
 */
router.post("/:messageId/reaction", authenticate, asyncHandler(async (req, res) => {
  const { emoji } = req.body;
  if (!emoji) return res.status(400).json({ error: "emoji required" });

  const msg = Messages.getById(req.params.messageId);
  if (!msg) return res.status(404).json({ error: "Message not found" });

  Messages.addReaction(req.params.messageId, emoji, req.user.wallet);

  const updated = Messages.getById(req.params.messageId);

  // Emit via WebSocket
  const io = req.app.get("io");
  if (io) {
    const targets = msg.recipient_id
      ? [msg.sender_id, msg.recipient_id].filter(id => id !== req.user.wallet)
      : []; // For groups, broadcast to all members
    targets.forEach(target => {
      io.to(`wallet:${target}`).emit("message:reaction", {
        messageId: req.params.messageId,
        reactions: JSON.parse(updated.reactions),
      });
    });
  }

  res.json({ messageId: req.params.messageId, reactions: JSON.parse(updated.reactions) });
}));

/**
 * DELETE /messages/:messageId
 * Soft-delete a message (sender only)
 */
router.delete("/:messageId", authenticate, asyncHandler(async (req, res) => {
  const result = Messages.softDelete(req.params.messageId, req.user.wallet);
  if (result.changes === 0) {
    return res.status(403).json({ error: "Cannot delete — not the sender or message not found" });
  }

  // Emit via WebSocket
  const io = req.app.get("io");
  if (io) {
    const msg = Messages.getById(req.params.messageId);
    if (msg?.recipient_id) {
      io.to(`wallet:${msg.recipient_id}`).emit("message:deleted", { messageId: req.params.messageId });
    }
  }

  res.json({ success: true });
}));

/**
 * DELETE /messages/conversation/:conversationId
 * Delete entire conversation
 */
router.delete("/conversation/:conversationId", authenticate, asyncHandler(async (req, res) => {
  Messages.deleteConversation(req.params.conversationId, req.user.wallet);
  res.json({ success: true });
}));

/**
 * GET /messages/unread/count
 * Get unread message counts per conversation
 */
router.get("/unread/count", authenticate, asyncHandler(async (req, res) => {
  const counts = Messages.getUnreadCount(req.user.wallet);
  res.json(counts.map(c => ({
    conversationId: c.conversation_id,
    count: c.count,
  })));
}));

/* ─── Helpers ─── */
function formatMessage(m) {
  return {
    id: m.id,
    conversationId: m.conversation_id,
    senderId: m.sender_id,
    recipientId: m.recipient_id,
    type: m.type,
    content: m.content,
    iv: m.iv,
    authTag: m.auth_tag,
    fileName: m.file_name,
    fileSize: m.file_size,
    fileType: m.file_type,
    voiceDuration: m.voice_duration,
    replyToId: m.reply_to_id,
    reactions: JSON.parse(m.reactions || "[]"),
    isRead: !!m.is_read,
    isDelivered: !!m.is_delivered,
    createdAt: m.created_at,
    editedAt: m.edited_at,
  };
}

module.exports = router;
