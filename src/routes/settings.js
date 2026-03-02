const { Router } = require('express');
const { settings } = require('../models');
const { authenticate } = require('../middleware');

const router = Router();

// GET /settings — get user settings
router.get('/', authenticate, (req, res) => {
  const userSettings = settings.findByUser.get(req.user.id);
  if (!userSettings) {
    // Return defaults
    return res.json({
      notifications_enabled: 1,
      sound_enabled: 1,
      theme: 'system',
      language: 'en',
    });
  }
  res.json(userSettings);
});

// PUT /settings — update settings
router.put('/', authenticate, (req, res) => {
  const {
    notifications_enabled = 1,
    sound_enabled = 1,
    theme = 'system',
    language = 'en',
  } = req.body;

  settings.upsert.run(req.user.id, notifications_enabled, sound_enabled, theme, language);
  const updated = settings.findByUser.get(req.user.id);
  res.json(updated);
});

module.exports = router;
