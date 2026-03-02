const { Router } = require('express');
const {
  generateChallenge,
  verifySignature,
  signAccessToken,
  signRefreshToken,
  hashToken,
  verifyToken,
} = require('../utils/crypto');
const { users, sessions } = require('../models');
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
  const { wallet, signature, message } = req.body;
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

  // Find or create user
  let user = users.findByWallet.get(walletLower);
  if (!user) {
    users.create.run(walletLower, null, 'ethereum', null);
    user = users.findByWallet.get(walletLower);
  }

  // Issue tokens
  const accessToken = signAccessToken({ userId: user.id, wallet: user.wallet });
  const refreshToken = signRefreshToken({ userId: user.id, wallet: user.wallet });

  // Store hashed tokens
  const decoded = verifyToken(refreshToken);
  const expiresAt = new Date(decoded.exp * 1000).toISOString();

  sessions.create.run(
    user.id,
    hashToken(accessToken),
    hashToken(refreshToken),
    req.ip,
    req.get('user-agent') || '',
    expiresAt
  );

  res.json({
    accessToken,
    refreshToken,
    user: { id: user.id, wallet: user.wallet, alias: user.alias, network: user.network },
  });
});

// POST /auth/refresh — refresh access token
router.post('/refresh', requireBody('refreshToken'), (req, res) => {
  const { refreshToken } = req.body;
  try {
    const payload = verifyToken(refreshToken);
    const refreshHash = hashToken(refreshToken);
    const session = sessions.findByRefreshHash.get(refreshHash);
    if (!session) {
      return res.status(401).json({ error: 'Invalid refresh token' });
    }

    // Revoke old session
    sessions.deleteByTokenHash.run(session.token_hash);

    // Issue new tokens
    const newAccess = signAccessToken({ userId: payload.userId, wallet: payload.wallet });
    const newRefresh = signRefreshToken({ userId: payload.userId, wallet: payload.wallet });

    const decoded = verifyToken(newRefresh);
    const expiresAt = new Date(decoded.exp * 1000).toISOString();

    sessions.create.run(
      payload.userId,
      hashToken(newAccess),
      hashToken(newRefresh),
      req.ip,
      req.get('user-agent') || '',
      expiresAt
    );

    res.json({ accessToken: newAccess, refreshToken: newRefresh });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

// POST /auth/logout — revoke current session
router.post('/logout', authenticate, (req, res) => {
  sessions.deleteByTokenHash.run(req.tokenHash);
  res.json({ message: 'Logged out' });
});

// POST /auth/logout-all — revoke all sessions
router.post('/logout-all', authenticate, (req, res) => {
  sessions.deleteByUserId.run(req.user.id);
  res.json({ message: 'All sessions revoked' });
});

module.exports = router;
