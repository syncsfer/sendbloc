const { Server } = require('socket.io');
const { verifyToken } = require('../utils/crypto');
const { users } = require('../models');
const config = require('../config');

// Track online users: wallet -> Set<socketId>
const onlineUsers = new Map();

function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: config.cors.origins,
      methods: ['GET', 'POST'],
    },
  });

  // ── Auth middleware ──────────────────────────────────────────────────────

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const payload = verifyToken(token);
      const user = users.findById.get(payload.userId);
      if (!user) {
        return next(new Error('User not found'));
      }
      socket.user = user;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  // ── Connection handler ──────────────────────────────────────────────────

  io.on('connection', (socket) => {
    const { user } = socket;

    // Join personal room
    socket.join(`user:${user.id}`);

    // Track online status
    if (!onlineUsers.has(user.wallet)) {
      onlineUsers.set(user.wallet, new Set());
    }
    onlineUsers.get(user.wallet).add(socket.id);

    // Broadcast online
    socket.broadcast.emit('presence:online', { wallet: user.wallet });

    // ── Typing indicators ───────────────────────────────────────────────

    socket.on('typing:start', ({ conversationId, recipientId }) => {
      const room = recipientId ? `user:${recipientId}` : conversationId;
      socket.to(room).emit('typing:start', { conversationId, wallet: user.wallet });
    });

    socket.on('typing:stop', ({ conversationId, recipientId }) => {
      const room = recipientId ? `user:${recipientId}` : conversationId;
      socket.to(room).emit('typing:stop', { conversationId, wallet: user.wallet });
    });

    // ── Read receipts ───────────────────────────────────────────────────

    socket.on('message:read', ({ conversationId, recipientId, messageIds }) => {
      if (recipientId) {
        io.to(`user:${recipientId}`).emit('message:read', {
          conversationId,
          readBy: user.wallet,
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
      const sockets = onlineUsers.get(user.wallet);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineUsers.delete(user.wallet);
          socket.broadcast.emit('presence:offline', {
            wallet: user.wallet,
            lastSeen: new Date().toISOString(),
          });
        }
      }
    });
  });

  return io;
}

module.exports = { initSocket };
