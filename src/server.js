// ═══════════════════════════════════════════
// SENDBLOC — Server Entry Point
// Wallet-to-wallet encrypted messaging backend
// ═══════════════════════════════════════════

require("dotenv").config();

const http = require("http");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const { Server: SocketIO } = require("socket.io");

const config = require("./config");
const db = require("./models/database");
const { globalLimiter, errorHandler, requestLogger } = require("./middleware");
const { initSocket, getOnlineCount } = require("./services/socket");

// Route imports
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const contactRoutes = require("./routes/contacts");
const messageRoutes = require("./routes/messages");
const groupRoutes = require("./routes/groups");
const settingsRoutes = require("./routes/settings");
const notificationRoutes = require("./routes/notifications");
const { keysRouter, networksRouter } = require("./routes/keys-networks");

/* ─────────────────────────────────────────
   INITIALIZATION
   ───────────────────────────────────────── */

// Initialize database
db.init();

// Express app
const app = express();
const server = http.createServer(app);

// Socket.IO
const io = new SocketIO(server, {
  cors: {
    origin: config.cors.origins,
    methods: ["GET", "POST"],
    credentials: true,
  },
  pingInterval: 25000,
  pingTimeout: 60000,
  maxHttpBufferSize: 1e6, // 1MB
});

// Make io available to routes
app.set("io", io);

// Initialize WebSocket handlers
initSocket(io);

/* ─────────────────────────────────────────
   MIDDLEWARE
   ───────────────────────────────────────── */

app.use(helmet({
  contentSecurityPolicy: false, // Adjust for your frontend
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: config.cors.origins,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(compression());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(globalLimiter);
app.use(requestLogger);

/* ─────────────────────────────────────────
   ROUTES
   ───────────────────────────────────────── */

const api = `/api/${config.apiVersion}`;

// Health check (no auth)
app.get(["/health", "/api/health"], (_req, res) => {
  res.json({
    status: "ok",
    service: "SendBloc API",
    version: config.apiVersion,
    uptime: Math.floor(process.uptime()),
    onlineUsers: getOnlineCount(),
    timestamp: new Date().toISOString(),
  });
});

// API info (no auth)
app.get(api, (_req, res) => {
  res.json({
    name: "SendBloc API",
    version: config.apiVersion,
    description: "Wallet-to-wallet encrypted messaging",
    endpoints: {
      auth: `${api}/auth`,
      users: `${api}/users`,
      contacts: `${api}/contacts`,
      messages: `${api}/messages`,
      groups: `${api}/groups`,
      settings: `${api}/settings`,
      notifications: `${api}/notifications`,
      keys: `${api}/keys`,
      networks: `${api}/networks`,
    },
    websocket: {
      url: "/",
      events: {
        incoming: [
          "message:new", "message:read", "message:reaction", "message:deleted",
          "typing:start", "typing:stop",
          "presence:online", "presence:offline", "presence:status",
          "group:created", "group:member_added", "group:member_online",
          "key:exchange_request", "key:exchange_accepted",
          "call:offer", "call:answer", "call:ice-candidate", "call:end",
        ],
        outgoing: [
          "typing:start", "typing:stop",
          "message:read", "presence:check",
          "group:join", "group:leave",
          "call:offer", "call:answer", "call:ice-candidate", "call:end",
        ],
      },
    },
    security: {
      encryption: "AES-256-GCM",
      keyExchange: "X25519 ECDH",
      authentication: "EIP-191 wallet signature + JWT",
      forwardSecrecy: true,
    },
  });
});

// Mount route modules
app.use(`${api}/auth`, authRoutes);
app.use(`${api}/users`, userRoutes);
app.use(`${api}/contacts`, contactRoutes);
app.use(`${api}/messages`, messageRoutes);
app.use(`${api}/groups`, groupRoutes);
app.use(`${api}/settings`, settingsRoutes);
app.use(`${api}/notifications`, notificationRoutes);
app.use(`${api}/keys`, keysRouter);
app.use(`${api}/networks`, networksRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Error handler (must be last)
app.use(errorHandler);

/* ─────────────────────────────────────────
   START SERVER
   ───────────────────────────────────────── */

server.listen(config.port, () => {
  console.log(`
╔═══════════════════════════════════════════════╗
║                                               ║
║   ⛓  SendBloc API Server                      ║
║                                               ║
║   Port:      ${String(config.port).padEnd(33)}║
║   Env:       ${config.env.padEnd(33)}║
║   API:       ${api.padEnd(33)}║
║   WebSocket: ws://localhost:${String(config.port).padEnd(20)}║
║                                               ║
║   Database:  SQLite (WAL mode)                ║
║   Auth:      EIP-191 + JWT                    ║
║   Encryption: AES-256-GCM                    ║
║                                               ║
╚═══════════════════════════════════════════════╝
  `);
});

/* ─────────────────────────────────────────
   GRACEFUL SHUTDOWN
   ───────────────────────────────────────── */

function shutdown(signal) {
  console.log(`\n[${signal}] Shutting down gracefully...`);

  server.close(() => {
    console.log("[HTTP] Server closed");
    io.close(() => {
      console.log("[WS] Socket.IO closed");
      db.close();
      process.exit(0);
    });
  });

  // Force exit after 10s
  setTimeout(() => {
    console.error("[TIMEOUT] Forced exit");
    process.exit(1);
  }, 10000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("uncaughtException", (err) => {
  console.error("[FATAL] Uncaught exception:", err);
  shutdown("UNCAUGHT");
});
process.on("unhandledRejection", (err) => {
  console.error("[FATAL] Unhandled rejection:", err);
});

module.exports = { app, server, io };
