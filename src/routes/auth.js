const { Router } = require('express');
const crypto = require('crypto');
const {
  generateChallenge,
  verifySignature,
  signAccessToken,
  signRefreshToken,
  hashToken,
  verifyToken,
} = require('../utils/crypto');
const { Users, Sessions } = require('../models');
const { authLimiter, authenticate, requireBody } = require('../middleware');

const router = Router();

// In-memory challenge store (short-lived, keyed by wallet)
const challenges = new Map();

// POST /auth/challenge — request a sign challenge
router.post('/challenge', authLimiter, requireBody('wallet'), (req, res) => {
  const { wallet } = req.body;
  const challenge = generateChallenge();
  challenges.set(wallet.toLowerCase(), { ...challenge, expiresAt: Date.now() + 5 * 60_000 });
  res.json({ message: challenge.message, nonce: challenge.nonce });
});

// POST /auth/verify — verify wallet signature, issue tokens
router.post('/verify', authLimiter, requireBody('wallet', 'signature', 'message'), (req, res) => {
  const { wallet, signature, message, publicKey } = req.body;
  const walletLower = wallet.toLowerCase();

  // Validate challenge exists and hasn't expired
  const challenge = challenges.get(walletLower);
  if (!challenge || challenge.message !== message) {
    return res.status(400).json({ error: 'Invalid or expired challenge' });
  }
  if (Date.now() > challenge.expiresAt) {
    challenges.delete(walletLower);
    return res.status(400).json({ error: 'Challenge expired' });
  }

  // Verify EIP-191 signature
  let valid;
  try {
    valid = verifySignature(message, signature, wallet);
  } catch {
    return res.status(400).json({ error: 'Signature verification failed' });
  }
  if (!valid) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  challenges.delete(walletLower);

  // Find or create user (wallet = id)
  let user = Users.findById(walletLower);
  if (!user) {
    if (!publicKey) {
      return res.status(400).json({ error: 'publicKey required for new accounts' });
    }
    Users.create(walletLower, publicKey, null);
    user = Users.findById(walletLower);
  }

  // Issue tokens
  const accessToken = signAccessToken({ sub: user.id });
  const refreshToken = signRefreshToken({ sub: user.id });

  // Store hashed tokens
  const decoded = verifyToken(refreshToken);
  const expiresAt = new Date(decoded.exp * 1000).toISOString();

  Sessions.create(
    crypto.randomUUID(),
    user.id,
    hashToken(accessToken),
    hashToken(refreshToken),
    expiresAt,
    req.get('user-agent') || '',
    req.ip
  );

  res.json({
    accessToken,
    refreshToken,
    user: { id: user.id, wallet: user.id, alias: user.alias, network: user.network },
  });
});

// POST /auth/refresh — refresh access token
router.post('/refresh', requireBody('refreshToken'), (req, res) => {
  const { refreshToken } = req.body;
  const payload = verifyToken(refreshToken);
  if (!payload) {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }

  const refreshHash = hashToken(refreshToken);
  const session = Sessions.findByRefreshHash(refreshHash);
  if (!session) {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }

  // Revoke old session
  Sessions.revoke(session.id);

  // Issue new tokens
  const newAccess = signAccessToken({ sub: payload.sub });
  const newRefresh = signRefreshToken({ sub: payload.sub });

  const decoded = verifyToken(newRefresh);
  const expiresAt = new Date(decoded.exp * 1000).toISOString();

  Sessions.create(
    crypto.randomUUID(),
    payload.sub,
    hashToken(newAccess),
    hashToken(newRefresh),
    expiresAt,
    req.get('user-agent') || '',
    req.ip
  );

  res.json({ accessToken: newAccess, refreshToken: newRefresh });
});

// POST /auth/logout — revoke current session
router.post('/logout', authenticate, (req, res) => {
  Sessions.revoke(req.session.id);
  res.json({ message: 'Logged out' });
});

// POST /auth/logout-all — revoke all sessions
router.post('/logout-all', authenticate, (req, res) => {
  Sessions.revokeAll(req.user.id);
  res.json({ message: 'All sessions revoked' });
});

module.exports = router;
