// ═══════════════════════════════════════════
// SENDBLOC — Auth Routes
// ═══════════════════════════════════════════

const { Router } = require("express");
const { Users, Sessions } = require("../models");
const { generateChallenge, verifyChallenge, issueTokens, generateId, hashToken, verifyToken } = require("../utils/crypto");
const { asyncHandler, authLimiter, authenticate, requireBody } = require("../middleware");

const router = Router();

// In-memory challenge store (use Redis in production)
const challenges = new Map();

/**
 * POST /auth/challenge
 * Request a sign challenge for wallet authentication
 */
router.post("/challenge", authLimiter, requireBody("wallet"), asyncHandler(async (req, res) => {
  const { wallet } = req.body;
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) {
    return res.status(400).json({ error: "Invalid wallet address" });
  }

  const challenge = generateChallenge(wallet);
  challenges.set(wallet.toLowerCase(), { ...challenge, createdAt: Date.now() });

  // Cleanup old challenges (>10 min)
  for (const [key, val] of challenges) {
    if (Date.now() - val.createdAt > 10 * 60 * 1000) challenges.delete(key);
  }

  res.json({
    message: challenge.message,
    nonce: challenge.nonce,
    expiresIn: 300, // 5 minutes
  });
}));

/**
 * POST /auth/verify
 * Verify signed challenge and issue JWT tokens
 */
router.post("/verify", authLimiter, requireBody("wallet", "signature"), asyncHandler(async (req, res) => {
  const { wallet, signature, publicKey, alias } = req.body;
  const normalizedWallet = wallet.toLowerCase();

  // Get stored challenge
  const challenge = challenges.get(normalizedWallet);
  if (!challenge) {
    return res.status(400).json({ error: "No pending challenge — request one first" });
  }

  // Verify signature
  const result = verifyChallenge(challenge.message, signature, wallet);
  if (!result.valid) {
    return res.status(401).json({ error: result.error });
  }

  challenges.delete(normalizedWallet);

  // Upsert user
  let user = Users.findById(normalizedWallet);
  if (!user) {
    if (!publicKey) {
      return res.status(400).json({ error: "publicKey required for new accounts" });
    }
    Users.create(normalizedWallet, publicKey, alias || null);
    user = Users.findById(normalizedWallet);
  }

  Users.updateOnlineStatus(normalizedWallet, true);

  // Issue tokens
  const tokens = issueTokens(normalizedWallet);
  const sessionId = generateId("sess");

  Sessions.create(
    sessionId, normalizedWallet,
    tokens.accessTokenHash, tokens.refreshTokenHash,
    tokens.expiresAt,
    req.headers["user-agent"], req.ip
  );

  res.json({
    user: {
      wallet: user.id,
      alias: user.alias,
      publicKey: user.public_key,
      network: user.network,
      createdAt: user.created_at,
    },
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
  });
}));

/**
 * POST /auth/refresh
 * Refresh access token using refresh token
 */
router.post("/refresh", authLimiter, requireBody("refreshToken"), asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  const payload = verifyToken(refreshToken);
  if (!payload || payload.type !== "refresh") {
    return res.status(401).json({ error: "Invalid refresh token" });
  }

  const hash = hashToken(refreshToken);
  const session = Sessions.findByRefreshHash(hash);
  if (!session) {
    return res.status(401).json({ error: "Session not found or revoked" });
  }

  // Revoke old session
  Sessions.revoke(session.id);

  // Issue new tokens
  const tokens = issueTokens(payload.sub);
  const newSessionId = generateId("sess");

  Sessions.create(
    newSessionId, payload.sub,
    tokens.accessTokenHash, tokens.refreshTokenHash,
    tokens.expiresAt,
    req.headers["user-agent"], req.ip
  );

  res.json({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: tokens.expiresAt,
  });
}));

/**
 * POST /auth/logout
 * Revoke current session
 */
router.post("/logout", authenticate, asyncHandler(async (req, res) => {
  Sessions.revoke(req.session.id);
  Users.updateOnlineStatus(req.user.wallet, false);
  res.json({ success: true });
}));

/**
 * POST /auth/logout-all
 * Revoke all sessions for wallet
 */
router.post("/logout-all", authenticate, asyncHandler(async (req, res) => {
  Sessions.revokeAll(req.user.wallet);
  Users.updateOnlineStatus(req.user.wallet, false);
  res.json({ success: true });
}));

module.exports = router;
