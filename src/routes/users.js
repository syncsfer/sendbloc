const { Router } = require('express');
const { Users, AddressHistory, Sessions, Settings } = require('../models');
const { authenticate, requireWallet } = require('../middleware');

const router = Router();

// GET /users/me — current user profile + settings
router.get('/me', authenticate, (req, res) => {
  const userSettings = Settings.get(req.user.id);
  res.json({ ...req.user, settings: userSettings || null });
});

// PATCH /users/me — update alias, network
router.patch('/me', authenticate, (req, res) => {
  const { alias, network } = req.body;
  if (alias !== undefined) Users.updateAlias(req.user.id, alias);
  if (network !== undefined) Users.updateNetwork(req.user.id, network);
  const updated = Users.findById(req.user.id);
  res.json(updated);
});

// DELETE /users/me — delete account
router.delete('/me', authenticate, (req, res) => {
  Sessions.revokeAll(req.user.id);
  Users.delete(req.user.id);
  res.json({ message: 'Account deleted' });
});

// GET /users/search — search by wallet or alias
router.get('/search', authenticate, (req, res) => {
  const q = req.query.q;
  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }
  const results = Users.search(q);
  res.json(results);
});

// GET /users/:wallet — public profile
router.get('/:wallet', authenticate, requireWallet, (req, res) => {
  const profile = Users.findById(req.params.wallet.toLowerCase());
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
  AddressHistory.add(newWallet.toLowerCase(), req.user.id, req.user.alias || null);

  res.json({ message: 'Address rotation recorded', oldWallet: req.user.id, newWallet });
});

// GET /users/me/address-history — previous addresses
router.get('/me/address-history', authenticate, (req, res) => {
  const history = AddressHistory.getForUser(req.user.id);
  res.json(history);
});

module.exports = router;
