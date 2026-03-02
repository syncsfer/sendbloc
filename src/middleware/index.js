// ═══════════════════════════════════════════
// SENDBLOC — Middleware
// ═══════════════════════════════════════════

const { verifyToken, hashToken } = require("../utils/crypto");
const { Sessions, Users } = require("../models");
const rateLimit = require("express-rate-limit");
const config = require("../config");

/* ─────────────────────────────────────────
   JWT AUTHENTICATION
   ───────────────────────────────────────── */
function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing authorization token" });
  }

  const token = header.slice(7);
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  // Verify session hasn't been revoked
  const tokenHash = hashToken(token);
  const session = Sessions.findByTokenHash(tokenHash);
  if (!session) {
    return res.status(401).json({ error: "Session revoked or expired" });
  }

  req.user = { wallet: payload.sub };
  req.session = session;

  // Resolve full user record for downstream route handlers
  const userRecord = Users.findByWallet(payload.sub);
  if (userRecord) {
    req.user = { ...userRecord, wallet: payload.sub };
  }

  next();
}

/**
 * Optional auth - attaches user if token present, continues either way
 */
function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next();

  const token = header.slice(7);
  const payload = verifyToken(token);
  if (payload) {
    req.user = { wallet: payload.sub };
  }
  next();
}

/* ─────────────────────────────────────────
   RATE LIMITERS
   ───────────────────────────────────────── */
const globalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 20,
  message: { error: "Too many authentication attempts" },
});

const messageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 min
  max: 60, // 60 messages per minute
  message: { error: "Message rate limit exceeded" },
});

/* ─────────────────────────────────────────
   VALIDATION HELPERS
   ───────────────────────────────────────── */
function validateWallet(wallet) {
  return /^0x[0-9a-fA-F]{40}$/.test(wallet);
}

function requireWallet(req, res, next) {
  const wallet = req.params.wallet || req.body.wallet;
  if (!wallet || !validateWallet(wallet)) {
    return res.status(400).json({ error: "Invalid wallet address" });
  }
  next();
}

function requireBody(...fields) {
  return (req, res, next) => {
    const missing = fields.filter((f) => req.body[f] === undefined || req.body[f] === null);
    if (missing.length > 0) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(", ")}` });
    }
    next();
  };
}

/* ─────────────────────────────────────────
   ERROR HANDLER
   ───────────────────────────────────────── */
function errorHandler(err, req, res, _next) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);

  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  if (err.code === "SQLITE_CONSTRAINT") {
    return res.status(409).json({ error: "Resource already exists" });
  }

  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: config.env === "production" ? "Internal server error" : err.message,
  });
}

/**
 * Async route wrapper to catch thrown errors
 */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/* ─────────────────────────────────────────
   REQUEST LOGGING
   ───────────────────────────────────────── */
function requestLogger(req, res, next) {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    const color = res.statusCode >= 400 ? "\x1b[31m" : res.statusCode >= 300 ? "\x1b[33m" : "\x1b[32m";
    console.log(`${color}${req.method}\x1b[0m ${req.path} ${res.statusCode} ${duration}ms`);
  });
  next();
}

module.exports = {
  authenticate, optionalAuth,
  globalLimiter, authLimiter, messageLimiter,
  validateWallet, requireWallet, requireBody,
  errorHandler, asyncHandler, requestLogger,
};
