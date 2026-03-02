// ═══════════════════════════════════════════
// SENDBLOC — Settings Routes
// ═══════════════════════════════════════════

const { Router } = require("express");
const { Settings } = require("../models");
const { asyncHandler, authenticate } = require("../middleware");

const router = Router();

/**
 * GET /settings
 * Get user settings
 */
router.get("/", authenticate, asyncHandler(async (req, res) => {
  const settings = Settings.get(req.user.wallet);

  if (!settings) {
    return res.json({
      notifications: true,
      readReceipts: true,
      biometricLock: false,
      sound: true,
      theme: "light",
      network: "ethereum",
    });
  }

  res.json({
    notifications: !!settings.notifications,
    readReceipts: !!settings.read_receipts,
    biometricLock: !!settings.biometric_lock,
    sound: !!settings.sound,
    theme: settings.theme,
    network: settings.network,
  });
}));

/**
 * PUT /settings
 * Update user settings
 */
router.put("/", authenticate, asyncHandler(async (req, res) => {
  Settings.upsert(req.user.wallet, req.body);

  const updated = Settings.get(req.user.wallet);

  res.json({
    notifications: !!updated.notifications,
    readReceipts: !!updated.read_receipts,
    biometricLock: !!updated.biometric_lock,
    sound: !!updated.sound,
    theme: updated.theme,
    network: updated.network,
  });
}));

module.exports = router;
