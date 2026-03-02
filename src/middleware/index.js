const rateLimit = require('express-rate-limit');
const config = require('../config');
const { verifyToken, hashToken } = require('../utils/crypto');
const { sessions, users } = require('../models');

// ── JWT Authentication ──────────────────────────────────────────────────────

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = header.slice(7);
  try {
    const payload = verifyToken(token);
    const tokenHash = hashToken(token);
    const session = sessions.findByTokenHash.get(tokenHash);
    if (!session) {
      return res.status(401).json({ error: 'Session not found or revoked' });
    }

    const user = users.findById.get(payload.userId);
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;
    req.tokenHash = tokenHash;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ── Rate Limiters ───────────────────────────────────────────────────────────

const globalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

const authLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts, please try again later' },
});

const messageLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Message rate limit exceeded' },
});

// ── Validation Helpers ──────────────────────────────────────────────────────

function requireBody(...fields) {
  return (req, res, next) => {
    const missing = fields.filter((f) => req.body[f] === undefined || req.body[f] === null);
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
    }
    next();
  };
}

function validateWallet(req, res, next) {
  const wallet = req.body.wallet || req.params.wallet;
  if (wallet && !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    return res.status(400).json({ error: 'Invalid wallet address format' });
  }
  next();
}

// ── Error Handler ───────────────────────────────────────────────────────────

function errorHandler(err, req, res, _next) {
  console.error(`[${new Date().toISOString()}] ${err.stack || err.message}`);
  const status = err.status || 500;
  res.status(status).json({
    error: config.env === 'production' ? 'Internal server error' : err.message,
  });
}

// ── 404 Handler ─────────────────────────────────────────────────────────────

function notFound(req, res) {
  res.status(404).json({ error: 'Not found' });
}

module.exports = {
  authenticate,
  globalLimiter,
  authLimiter,
  messageLimiter,
  requireBody,
  validateWallet,
  errorHandler,
  notFound,
};
