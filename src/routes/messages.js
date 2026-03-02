const { Router } = require('express');
const { messages, users } = require('../models');
const { authenticate, messageLimiter, requireBody } = require('../middleware');

const router = Router();

// GET /messages/conversations — list conversations
router.get('/conversations', authenticate, (req, res) => {
  const convos = messages.getConversations.all(req.user.id, req.user.id, req.user.id);

  // Enrich with other user info
  const enriched = convos.map((c) => {
    const otherUser = c.other_user_id ? users.findById.get(c.other_user_id) : null;
    return {
      conversationId: c.conversation_id,
      lastMessageAt: c.last_message_at,
      groupId: c.group_id,
      otherUser: otherUser
        ? { id: otherUser.id, wallet: otherUser.wallet, alias: otherUser.alias, avatar_url: otherUser.avatar_url }
        : null,
    };
  });

  res.json(enriched);
});

// GET /messages/unread/count — unread counts per conversation
router.get('/unread/count', authenticate, (req, res) => {
  const counts = messages.getUnreadCount.all(req.user.id, String(req.user.id));
  res.json(counts);
});

// GET /messages/:convId — get messages in a conversation (paginated)
router.get('/:convId', authenticate, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
  const offset = parseInt(req.query.offset, 10) || 0;
  const msgs = messages.getByConversation.all(req.params.convId, limit, offset);
  res.json(msgs);
});

// POST /messages/send — send an encrypted message
router.post('/send', authenticate, messageLimiter, requireBody('recipientId', 'encryptedContent', 'iv', 'authTag'), (req, res) => {
  const { recipientId, groupId, encryptedContent, iv, authTag, messageType } = req.body;

  // Generate conversation ID
  let conversationId;
  if (groupId) {
    conversationId = `group-${groupId}`;
  } else {
    conversationId = [req.user.id, recipientId].sort((a, b) => a - b).join('-');
  }

  const result = messages.create.run(
    conversationId,
    req.user.id,
    groupId ? null : recipientId,
    groupId || null,
    encryptedContent,
    iv,
    authTag,
    messageType || 'text'
  );

  const message = messages.findById.get(result.lastInsertRowid);

  // Emit via Socket.IO if available
  const io = req.app.get('io');
  if (io) {
    if (groupId) {
      io.to(`group:${groupId}`).emit('message:new', message);
    } else {
      io.to(`user:${recipientId}`).emit('message:new', message);
    }
  }

  res.status(201).json(message);
});

// POST /messages/:id/read — mark message as read
router.post('/:id/read', authenticate, (req, res) => {
  const msg = messages.findById.get(req.params.id);
  if (!msg) {
    return res.status(404).json({ error: 'Message not found' });
  }

  const readBy = JSON.parse(msg.read_by || '[]');
  if (!readBy.includes(req.user.id)) {
    readBy.push(req.user.id);
    messages.markRead.run(JSON.stringify(readBy), msg.id);
  }

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
  const msg = messages.findById.get(req.params.id);
  if (!msg) {
    return res.status(404).json({ error: 'Message not found' });
  }

  const reactions = JSON.parse(msg.reactions || '{}');
  const { emoji } = req.body;

  if (!reactions[emoji]) {
    reactions[emoji] = [];
  }

  const idx = reactions[emoji].indexOf(req.user.id);
  if (idx === -1) {
    reactions[emoji].push(req.user.id);
  } else {
    reactions[emoji].splice(idx, 1);
    if (reactions[emoji].length === 0) delete reactions[emoji];
  }

  messages.updateReactions.run(JSON.stringify(reactions), msg.id);

  // Emit reaction update
  const io = req.app.get('io');
  if (io) {
    const room = msg.group_id ? `group:${msg.group_id}` : `user:${msg.sender_id}`;
    io.to(room).emit('message:reaction', { messageId: msg.id, reactions });
  }

  res.json({ reactions });
});

// DELETE /messages/:id — soft-delete message
router.delete('/:id', authenticate, (req, res) => {
  const msg = messages.findById.get(req.params.id);
  if (!msg) {
    return res.status(404).json({ error: 'Message not found' });
  }
  if (msg.sender_id !== req.user.id) {
    return res.status(403).json({ error: 'Can only delete your own messages' });
  }

  messages.softDelete.run(msg.id);

  const io = req.app.get('io');
  if (io) {
    const room = msg.group_id ? `group:${msg.group_id}` : `user:${msg.recipient_id}`;
    io.to(room).emit('message:deleted', { messageId: msg.id });
  }

  res.json({ message: 'Message deleted' });
});

// DELETE /messages/conversation/:id — delete entire conversation
router.delete('/conversation/:id', authenticate, (req, res) => {
  messages.deleteConversation.run(req.params.id, req.user.id, req.user.id);
  res.json({ message: 'Conversation deleted' });
});

module.exports = router;
