const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config');
const { globalLimiter, errorHandler, requestLogger } = require('./middleware');
const { initSocket } = require('./services/socket');

// Routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const contactRoutes = require('./routes/contacts');
const messageRoutes = require('./routes/messages');
const groupRoutes = require('./routes/groups');
const settingsRoutes = require('./routes/settings');
const notificationRoutes = require('./routes/notifications');
const keysNetworksRoutes = require('./routes/keys-networks');

const app = express();
const server = http.createServer(app);

// ── Socket.IO ───────────────────────────────────────────────────────────────

const io = initSocket(server);
app.set('io', io);

// ── Global middleware ───────────────────────────────────────────────────────

app.use(helmet());
app.use(cors({ origin: config.cors.origins, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(requestLogger);
app.use(globalLimiter);

// ── API routes ──────────────────────────────────────────────────────────────

const api = '/api/v1';

app.use(`${api}/auth`, authRoutes);
app.use(`${api}/users`, userRoutes);
app.use(`${api}/contacts`, contactRoutes);
app.use(`${api}/messages`, messageRoutes);
app.use(`${api}/groups`, groupRoutes);
app.use(`${api}/settings`, settingsRoutes);
app.use(`${api}/notifications`, notificationRoutes);

// keys-networks mounts both /keys/* and /networks/* at the root api level
app.use(api, keysNetworksRoutes);

// ── Health check ────────────────────────────────────────────────────────────

app.get(['/health', '/api/health'], (_req, res) => {
  res.json({ service: 'SendBloc API', status: 'ok', uptime: process.uptime() });
});

// ── API info ─────────────────────────────────────────────────────────────────

app.get(api, (_req, res) => {
  res.json({
    service: 'SendBloc API',
    version: '1.0.0',
    endpoints: {
      auth: ['POST /auth/challenge', 'POST /auth/verify', 'POST /auth/refresh', 'POST /auth/logout', 'POST /auth/logout-all'],
      users: ['GET /users/me', 'PATCH /users/me', 'DELETE /users/me', 'GET /users/search', 'GET /users/:wallet', 'POST /users/me/rotate-address', 'GET /users/me/address-history'],
      contacts: ['GET /contacts', 'POST /contacts', 'PATCH /contacts/:id', 'POST /contacts/:id/block', 'POST /contacts/:id/mute', 'DELETE /contacts/:id'],
      messages: ['GET /messages/conversations', 'GET /messages/unread/count', 'GET /messages/:convId', 'POST /messages/send', 'POST /messages/:id/read', 'POST /messages/:id/reaction', 'DELETE /messages/:id', 'DELETE /messages/conversation/:id'],
      groups: ['GET /groups', 'POST /groups', 'GET /groups/:id', 'PATCH /groups/:id', 'POST /groups/:id/members', 'DELETE /groups/:id/members/:uid', 'POST /groups/:id/leave', 'DELETE /groups/:id'],
      settings: ['GET /settings', 'PUT /settings'],
      notifications: ['GET /notifications', 'POST /notifications/:id/read', 'POST /notifications/read-all'],
      keys: ['POST /keys/exchange', 'GET /keys/pending', 'POST /keys/accept/:id'],
      networks: ['GET /networks', 'GET /networks/status'],
    },
    websocket: {
      connect: 'io("ws://localhost:3001", { auth: { token: "<jwt>" } })',
      events: {
        client: ['typing:start', 'typing:stop', 'message:read', 'group:join', 'group:leave', 'presence:check', 'call:offer', 'call:answer', 'call:ice-candidate', 'call:end'],
        server: ['message:new', 'message:read', 'message:reaction', 'message:deleted', 'typing:start', 'typing:stop', 'presence:online', 'presence:offline', 'presence:status', 'group:created', 'group:member_added', 'key:exchange_request', 'key:exchange_accepted'],
      },
    },
  });
});

// ── Error handling ──────────────────────────────────────────────────────────

app.use((_req, res) => { res.status(404).json({ error: 'Not found' }); });
app.use(errorHandler);

// ── Start server ────────────────────────────────────────────────────────────

server.listen(config.port, () => {
  console.log(`SendBloc server running on port ${config.port} (${config.env})`);
});

module.exports = { app, server, io };
