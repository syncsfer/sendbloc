const { Router } = require('express');
const crypto = require('crypto');
const { users, addressHistory, sessions, settings } = require('../models');
const { authenticate, requireWallet } = require('../middleware');

const router = Router();

// GET /users/me — current user profile + settings
router.get('/me', authenticate, (req, res) => {
  const userSettings = settings.findByUser.get(req.user.id);
  res.json({ ...req.user, settings: userSettings || null });
});

// PATCH /users/me — update alias, network, avatar
router.patch('/me', authenticate, (req, res) => {
  const { alias, network, avatar_url } = req.body;
  users.update.run(
    alias ?? req.user.alias,
    network ?? req.user.network,
    avatar_url ?? req.user.avatar_url,
    req.user.id
  );
  const updated = users.findById.get(req.user.id);
  res.json(updated);
});

// DELETE /users/me — delete account
router.delete('/me', authenticate, (req, res) => {
  sessions.deleteByUserId.run(req.user.id);
  users.delete.run(req.user.id);
  res.json({ message: 'Account deleted' });
});

// GET /users/search — search by wallet or alias
router.get('/search', authenticate, (req, res) => {
  const q = req.query.q;
  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }
  const pattern = `%${q}%`;
  const results = users.search.all(pattern, pattern);
  res.json(results);
});

// GET /users/:wallet — public profile
router.get('/:wallet', authenticate, requireWallet, (req, res) => {
  const profile = users.getPublicProfile.get(req.params.wallet.toLowerCase());
  if (!profile) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json(profile);
});

// POST /users/me/rotate-address — generate new wallet address
router.post('/me/rotate-address', authenticate, (req, res) => {
  const { newWallet } = req.body;
  if (!newWallet) {
    return res.status(400).json({ error: 'newWallet is required' });
  }

  // Store old address in history
  addressHistory.create.run(req.user.id, req.user.wallet);

  // Update wallet
  users.rotateAddress.run(newWallet.toLowerCase(), req.user.id);
  const updated = users.findById.get(req.user.id);
  res.json(updated);
});

// GET /users/me/address-history — previous addresses
router.get('/me/address-history', authenticate, (req, res) => {
  const history = addressHistory.findByUser.all(req.user.id);
  res.json(history);
});

module.exports = router;
