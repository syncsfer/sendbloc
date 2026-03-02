// ═══════════════════════════════════════════
// SENDBLOC — WebSocket Service (Socket.IO)
// Real-time messaging, presence, typing
// ═══════════════════════════════════════════

const { verifyToken, hashToken } = require("../utils/crypto");
const { Users, Sessions, Groups } = require("../models");

// Online wallet → socket ID mapping
const onlineUsers = new Map();

/**
 * Initialize WebSocket handlers
 */
function initSocket(io) {
  // Authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error("Authentication required"));

    const payload = verifyToken(token);
    if (!payload) return next(new Error("Invalid token"));

    const hash = hashToken(token);
    const session = Sessions.findByTokenHash(hash);
    if (!session) return next(new Error("Session revoked"));

    socket.wallet = payload.sub;
    next();
  });

  io.on("connection", (socket) => {
    const wallet = socket.wallet;
    console.log(`[WS] Connected: ${wallet.slice(0, 10)}...`);

    // ─── Join personal room ───
    socket.join(`wallet:${wallet}`);
    onlineUsers.set(wallet, socket.id);

    // Update online status
    Users.updateOnlineStatus(wallet, true);

    // Broadcast presence
    socket.broadcast.emit("presence:online", { wallet });

    // ─── Join all group rooms ───
    const groups = Groups.getForUser(wallet);
    groups.forEach((g) => socket.join(`group:${g.id}`));

    // ════════════════════════════════════
    // EVENT HANDLERS
    // ════════════════════════════════════

    /**
     * Typing indicator
     * { conversationId, recipientId? }
     */
    socket.on("typing:start", (data) => {
      if (data.recipientId) {
        io.to(`wallet:${data.recipientId}`).emit("typing:start", {
          conversationId: data.conversationId,
          wallet,
        });
      } else if (data.groupId) {
        socket.to(`group:${data.groupId}`).emit("typing:start", {
          conversationId: data.groupId,
          wallet,
        });
      }
    });

    socket.on("typing:stop", (data) => {
      if (data.recipientId) {
        io.to(`wallet:${data.recipientId}`).emit("typing:stop", {
          conversationId: data.conversationId,
          wallet,
        });
      } else if (data.groupId) {
        socket.to(`group:${data.groupId}`).emit("typing:stop", {
          conversationId: data.groupId,
          wallet,
        });
      }
    });

    /**
     * Message read receipt
     * { conversationId, messageIds }
     */
    socket.on("message:read", (data) => {
      // Forward to conversation participants
      if (data.recipientId) {
        io.to(`wallet:${data.recipientId}`).emit("message:read", {
          conversationId: data.conversationId,
          readBy: wallet,
          messageIds: data.messageIds,
        });
      }
    });

    /**
     * Join a group room (after being added)
     */
    socket.on("group:join", (data) => {
      socket.join(`group:${data.groupId}`);
      socket.to(`group:${data.groupId}`).emit("group:member_online", { wallet });
    });

    /**
     * Leave a group room
     */
    socket.on("group:leave", (data) => {
      socket.leave(`group:${data.groupId}`);
    });

    /**
     * Presence check - respond to ping with list of online contacts
     */
    socket.on("presence:check", (data) => {
      const { wallets } = data;
      const online = wallets.filter((w) => onlineUsers.has(w));
      socket.emit("presence:status", { online });
    });

    /**
     * Voice call signaling (WebRTC prep — future)
     */
    socket.on("call:offer", (data) => {
      io.to(`wallet:${data.recipientId}`).emit("call:offer", {
        from: wallet,
        offer: data.offer,
      });
    });

    socket.on("call:answer", (data) => {
      io.to(`wallet:${data.recipientId}`).emit("call:answer", {
        from: wallet,
        answer: data.answer,
      });
    });

    socket.on("call:ice-candidate", (data) => {
      io.to(`wallet:${data.recipientId}`).emit("call:ice-candidate", {
        from: wallet,
        candidate: data.candidate,
      });
    });

    socket.on("call:end", (data) => {
      io.to(`wallet:${data.recipientId}`).emit("call:end", { from: wallet });
    });

    // ─── Disconnect ───
    socket.on("disconnect", (reason) => {
      console.log(`[WS] Disconnected: ${wallet.slice(0, 10)}... (${reason})`);
      onlineUsers.delete(wallet);
      Users.updateOnlineStatus(wallet, false);
      socket.broadcast.emit("presence:offline", { wallet, lastSeen: new Date().toISOString() });
    });

    // ─── Error handling ───
    socket.on("error", (err) => {
      console.error(`[WS] Error for ${wallet.slice(0, 10)}...:`, err.message);
    });
  });

  // Periodic cleanup
  setInterval(() => {
    Sessions.cleanup();
  }, 60 * 60 * 1000); // Every hour

  console.log("[WS] Socket.IO initialized");
  return io;
}

/**
 * Get online users count
 */
function getOnlineCount() {
  return onlineUsers.size;
}

/**
 * Check if a wallet is online
 */
function isOnline(wallet) {
  return onlineUsers.has(wallet);
}

module.exports = { initSocket, getOnlineCount, isOnline };
