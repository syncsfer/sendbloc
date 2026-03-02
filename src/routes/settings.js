const { Router } = require('express');
const { Settings } = require('../models');
const { authenticate } = require('../middleware');

const router = Router();

// GET /settings — get user settings
router.get('/', authenticate, (req, res) => {
  const userSettings = Settings.get(req.user.id);
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
    notifications = true,
    sound = true,
    theme = 'light',
    read_receipts: readReceipts = true,
    biometric_lock: biometricLock = false,
    network = 'ethereum',
  } = req.body;

  Settings.upsert(req.user.id, { notifications, sound, theme, readReceipts, biometricLock, network });
  const updated = Settings.get(req.user.id);
  res.json(updated);
});

module.exports = router;
