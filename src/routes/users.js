// ═══════════════════════════════════════════
// SENDBLOC — User Routes
// ═══════════════════════════════════════════

const { Router } = require("express");
const { Users, AddressHistory, Settings } = require("../models");
const { generateId } = require("../utils/crypto");
const { asyncHandler, authenticate } = require("../middleware");

const router = Router();

/**
 * GET /users/me
 * Get current user profile
 */
router.get("/me", authenticate, asyncHandler(async (req, res) => {
  const user = Users.findById(req.user.wallet);
  if (!user) return res.status(404).json({ error: "User not found" });

  const settings = Settings.get(req.user.wallet);
  const history = AddressHistory.getForUser(req.user.wallet);

  res.json({
    wallet: user.id,
    alias: user.alias,
    publicKey: user.public_key,
    network: user.network,
    isOnline: !!user.is_online,
    createdAt: user.created_at,
    lastSeen: user.last_seen,
    settings: settings ? {
      notifications: !!settings.notifications,
      readReceipts: !!settings.read_receipts,
      biometricLock: !!settings.biometric_lock,
      sound: !!settings.sound,
      theme: settings.theme,
      network: settings.network,
    } : null,
    addressHistory: history.map(h => ({
      wallet: h.old_wallet,
      alias: h.old_alias,
      rotatedAt: h.rotated_at,
    })),
  });
}));

/**
 * PATCH /users/me
 * Update current user profile
 */
router.patch("/me", authenticate, asyncHandler(async (req, res) => {
  const { alias, network } = req.body;

  if (alias !== undefined) {
    // Check alias uniqueness
    if (alias) {
      const existing = Users.findByAlias(alias);
      if (existing && existing.id !== req.user.wallet) {
        return res.status(409).json({ error: "Alias already taken" });
      }
    }
    Users.updateAlias(req.user.wallet, alias || null);
  }

  if (network) {
    Users.updateNetwork(req.user.wallet, network);
  }

  const updated = Users.findById(req.user.wallet);
  res.json({
    wallet: updated.id,
    alias: updated.alias,
    network: updated.network,
    updatedAt: updated.updated_at,
  });
}));

/**
 * GET /users/search?q=
 * Search users by wallet or alias
 */
router.get("/search", authenticate, asyncHandler(async (req, res) => {
  const { q, limit } = req.query;
  if (!q || q.length < 2) return res.status(400).json({ error: "Query must be at least 2 characters" });

  const results = Users.search(q, parseInt(limit) || 20);
  res.json(results.map(u => ({
    wallet: u.id,
    alias: u.alias,
    isOnline: !!u.is_online,
    lastSeen: u.last_seen,
  })));
}));

/**
 * GET /users/:wallet
 * Get public profile of another user
 */
router.get("/:wallet", authenticate, asyncHandler(async (req, res) => {
  const user = Users.findById(req.params.wallet.toLowerCase());
  if (!user) return res.status(404).json({ error: "User not found" });

  res.json({
    wallet: user.id,
    alias: user.alias,
    publicKey: user.public_key,
    isOnline: !!user.is_online,
    lastSeen: user.last_seen,
  });
}));

/**
 * POST /users/me/rotate-address
 * Generate a new wallet address and archive the old one
 */
router.post("/me/rotate-address", authenticate, asyncHandler(async (req, res) => {
  const { newWallet, newPublicKey } = req.body;
  if (!newWallet || !newPublicKey) {
    return res.status(400).json({ error: "newWallet and newPublicKey required" });
  }

  const currentUser = Users.findById(req.user.wallet);
  if (!currentUser) return res.status(404).json({ error: "User not found" });

  // Archive current address
  AddressHistory.add(newWallet.toLowerCase(), currentUser.id, currentUser.alias);

  // Create new user record
  Users.create(newWallet.toLowerCase(), newPublicKey, currentUser.alias);

  // Transfer contacts: update contact references
  // (In production, this would be a more complex migration)

  res.json({
    success: true,
    newWallet: newWallet.toLowerCase(),
    archivedWallet: currentUser.id,
  });
}));

/**
 * GET /users/me/address-history
 * Get address rotation history
 */
router.get("/me/address-history", authenticate, asyncHandler(async (req, res) => {
  const history = AddressHistory.getForUser(req.user.wallet);
  res.json(history.map(h => ({
    wallet: h.old_wallet,
    alias: h.old_alias,
    rotatedAt: h.rotated_at,
  })));
}));

/**
 * DELETE /users/me
 * Delete account and all data
 */
router.delete("/me", authenticate, asyncHandler(async (req, res) => {
  Users.delete(req.user.wallet);
  res.json({ success: true, message: "Account deleted" });
}));

module.exports = router;
