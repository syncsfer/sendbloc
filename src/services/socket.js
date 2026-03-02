const { verifyToken } = require('../utils/crypto');
const { Users } = require('../models');

// Track online users: wallet -> Set<socketId>
const onlineUsers = new Map();

function getOnlineCount() {
  return onlineUsers.size;
}

function initSocket(io) {

  // ── Auth middleware ──────────────────────────────────────────────────────

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    const payload = verifyToken(token);
    if (!payload) {
      return next(new Error('Invalid token'));
    }
    const user = Users.findById(payload.sub);
    if (!user) {
      return next(new Error('User not found'));
    }
    socket.user = user;
    next();
  });

  // ── Connection handler ──────────────────────────────────────────────────

  io.on('connection', (socket) => {
    const { user } = socket;

    // Join personal room
    socket.join(`user:${user.id}`);

    // Track online status (wallet = id)
    if (!onlineUsers.has(user.id)) {
      onlineUsers.set(user.id, new Set());
    }
    onlineUsers.get(user.id).add(socket.id);

    // Broadcast online
    socket.broadcast.emit('presence:online', { wallet: user.id });

    // ── Typing indicators ───────────────────────────────────────────────

    socket.on('typing:start', ({ conversationId, recipientId }) => {
      const room = recipientId ? `user:${recipientId}` : conversationId;
      socket.to(room).emit('typing:start', { conversationId, wallet: user.id });
    });

    socket.on('typing:stop', ({ conversationId, recipientId }) => {
      const room = recipientId ? `user:${recipientId}` : conversationId;
      socket.to(room).emit('typing:stop', { conversationId, wallet: user.id });
    });

    // ── Read receipts ───────────────────────────────────────────────────

    socket.on('message:read', ({ conversationId, recipientId, messageIds }) => {
      if (recipientId) {
        io.to(`user:${recipientId}`).emit('message:read', {
          conversationId,
          readBy: user.id,
          messageIds,
        });
      }
    });

    // ── Group rooms ─────────────────────────────────────────────────────

    socket.on('group:join', ({ groupId }) => {
      socket.join(`group:${groupId}`);
    });

    socket.on('group:leave', ({ groupId }) => {
      socket.leave(`group:${groupId}`);
    });

    // ── Presence checks ─────────────────────────────────────────────────

    socket.on('presence:check', ({ wallets }) => {
      const online = wallets.filter((w) => onlineUsers.has(w) && onlineUsers.get(w).size > 0);
      socket.emit('presence:status', { online });
    });

    // ── WebRTC signaling ────────────────────────────────────────────────

    socket.on('call:offer', ({ recipientId, offer }) => {
      io.to(`user:${recipientId}`).emit('call:offer', {
        senderId: user.id,
        offer,
      });
    });

    socket.on('call:answer', ({ recipientId, answer }) => {
      io.to(`user:${recipientId}`).emit('call:answer', {
        senderId: user.id,
        answer,
      });
    });

    socket.on('call:ice-candidate', ({ recipientId, candidate }) => {
      io.to(`user:${recipientId}`).emit('call:ice-candidate', {
        senderId: user.id,
        candidate,
      });
    });

    socket.on('call:end', ({ recipientId }) => {
      io.to(`user:${recipientId}`).emit('call:end', {
        senderId: user.id,
      });
    });

    // ── Disconnect ──────────────────────────────────────────────────────

    socket.on('disconnect', () => {
      const sockets = onlineUsers.get(user.id);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineUsers.delete(user.id);
          socket.broadcast.emit('presence:offline', {
            wallet: user.id,
            lastSeen: new Date().toISOString(),
          });
        }
      }
    });
  });

}

module.exports = { initSocket, getOnlineCount };
