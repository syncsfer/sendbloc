const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config');
const { globalLimiter, errorHandler, notFound } = require('./middleware');
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

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ── Error handling ──────────────────────────────────────────────────────────

app.use(notFound);
app.use(errorHandler);

// ── Start server ────────────────────────────────────────────────────────────

server.listen(config.port, () => {
  console.log(`SendBloc server running on port ${config.port} (${config.nodeEnv})`);
});

module.exports = { app, server, io };
