const { Router } = require('express');
const { settings } = require('../models');
const { authenticate } = require('../middleware');

const router = Router();

// GET /settings — get user settings
router.get('/', authenticate, (req, res) => {
  const userSettings = settings.findByUser.get(req.user.id);
  if (!userSettings) {
    // Return defaults matching schema
    return res.json({
      notifications: 1,
      sound: 1,
      theme: 'light',
      read_receipts: 1,
      biometric_lock: 0,
      network: 'ethereum',
    });
  }
  res.json(userSettings);
});

// PUT /settings — update settings
router.put('/', authenticate, (req, res) => {
  const {
    notifications = 1,
    sound = 1,
    theme = 'light',
    read_receipts = 1,
    biometric_lock = 0,
    network = 'ethereum',
  } = req.body;

  settings.upsert.run(req.user.id, notifications, sound, theme, read_receipts, biometric_lock, network);
  const updated = settings.findByUser.get(req.user.id);
  res.json(updated);
});

module.exports = router;
