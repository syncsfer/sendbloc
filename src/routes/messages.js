const { Router } = require('express');
const crypto = require('crypto');
const { Messages, Users } = require('../models');
const { authenticate, messageLimiter, requireBody } = require('../middleware');

const router = Router();

// GET /messages/conversations — list conversations
router.get('/conversations', authenticate, (req, res) => {
  const convos = Messages.getConversationsList(req.user.id);

  // Enrich with other user info
  const enriched = convos.map((c) => {
    const otherUserId = c.sender_id === req.user.id ? null : c.sender_id;
    const otherUser = otherUserId ? Users.findById(otherUserId) : null;
    return {
      conversationId: c.conversation_id,
      lastMessageAt: c.created_at,
      unreadCount: c.unread_count,
      lastMessage: { content: c.content, type: c.type, senderId: c.sender_id },
      otherUser: otherUser
        ? { id: otherUser.id, alias: otherUser.alias, avatar_gradient: otherUser.avatar_gradient }
        : null,
    };
  });

  res.json(enriched);
});

// GET /messages/unread/count — unread counts per conversation
router.get('/unread/count', authenticate, (req, res) => {
  const counts = Messages.getUnreadCount(req.user.id);
  res.json(counts);
});

// GET /messages/:convId — get messages in a conversation (paginated)
router.get('/:convId', authenticate, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
  const offset = parseInt(req.query.offset, 10) || 0;
  const msgs = Messages.getByConversation(req.params.convId, limit, offset);
  res.json(msgs);
});

// POST /messages/send — send an encrypted message
router.post('/send', authenticate, messageLimiter, requireBody('recipientId', 'content', 'iv', 'authTag'), (req, res) => {
  const { recipientId, content, iv, authTag, type } = req.body;

  // Generate conversation ID (string sort for wallet addresses)
  const conversationId = [req.user.id, recipientId].sort().join('-');

  const messageId = crypto.randomUUID();
  Messages.create({
    id: messageId,
    conversationId,
    senderId: req.user.id,
    recipientId,
    type: type || 'text',
    content,
    iv,
    authTag,
  });

  const message = Messages.getById(messageId);

  // Emit via Socket.IO if available
  const io = req.app.get('io');
  if (io) {
    io.to(`user:${recipientId}`).emit('message:new', message);
  }

  res.status(201).json(message);
});

// POST /messages/:id/read — mark messages as read in conversation
router.post('/:id/read', authenticate, (req, res) => {
  const msg = Messages.getById(req.params.id);
  if (!msg) {
    return res.status(404).json({ error: 'Message not found' });
  }

  Messages.markRead(msg.conversation_id, req.user.id);

  // Emit read receipt
  const io = req.app.get('io');
  if (io) {
    io.to(`user:${msg.sender_id}`).emit('message:read', {
      conversationId: msg.conversation_id,
      readBy: req.user.id,
    });
  }

  res.json({ message: 'Marked as read' });
});

// POST /messages/:id/reaction — toggle reaction
router.post('/:id/reaction', authenticate, requireBody('emoji'), (req, res) => {
  const msg = Messages.getById(req.params.id);
  if (!msg) {
    return res.status(404).json({ error: 'Message not found' });
  }

  const { emoji } = req.body;
  Messages.addReaction(msg.id, emoji, req.user.id);

  // Fetch updated reactions
  const updated = Messages.getById(msg.id);
  const reactions = JSON.parse(updated.reactions || '[]');

  // Emit reaction update
  const io = req.app.get('io');
  if (io) {
    io.to(`user:${msg.sender_id}`).emit('message:reaction', { messageId: msg.id, reactions });
  }

  res.json({ reactions });
});

// DELETE /messages/:id — soft-delete message
router.delete('/:id', authenticate, (req, res) => {
  const msg = Messages.getById(req.params.id);
  if (!msg) {
    return res.status(404).json({ error: 'Message not found' });
  }
  if (msg.sender_id !== req.user.id) {
    return res.status(403).json({ error: 'Can only delete your own messages' });
  }

  Messages.softDelete(msg.id, req.user.id);

  const io = req.app.get('io');
  if (io && msg.recipient_id) {
    io.to(`user:${msg.recipient_id}`).emit('message:deleted', { messageId: msg.id });
  }

  res.json({ message: 'Message deleted' });
});

// DELETE /messages/conversation/:id — delete entire conversation
router.delete('/conversation/:id', authenticate, (req, res) => {
  Messages.deleteConversation(req.params.id, req.user.id);
  res.json({ message: 'Conversation deleted' });
});

module.exports = router;
