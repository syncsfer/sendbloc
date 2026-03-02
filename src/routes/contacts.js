// ═══════════════════════════════════════════
// SENDBLOC — Contacts Routes
// ═══════════════════════════════════════════

const { Router } = require("express");
const { Contacts, Users } = require("../models");
const { asyncHandler, authenticate, requireBody } = require("../middleware");

const router = Router();

/**
 * GET /contacts
 * List all contacts for current user
 */
router.get("/", authenticate, asyncHandler(async (req, res) => {
  const contacts = Contacts.getAll(req.user.wallet);

  res.json(contacts.map(c => ({
    contactId: c.contact_id,
    alias: c.alias || c.resolved_alias,
    isBlocked: !!c.is_blocked,
    isMuted: !!c.is_muted,
    isOnline: !!c.is_online,
    lastSeen: c.last_seen,
    publicKey: c.public_key,
    addedAt: c.added_at,
  })));
}));

/**
 * POST /contacts
 * Add a new contact
 */
router.post("/", authenticate, requireBody("contactId"), asyncHandler(async (req, res) => {
  const { contactId, alias } = req.body;
  const normalized = contactId.toLowerCase();

  if (normalized === req.user.wallet) {
    return res.status(400).json({ error: "Cannot add yourself as contact" });
  }

  // Check if already a contact
  const existing = Contacts.find(req.user.wallet, normalized);
  if (existing) {
    return res.status(409).json({ error: "Contact already exists" });
  }

  Contacts.add(req.user.wallet, normalized, alias || null);

  // Also resolve user info if they exist
  const user = Users.findById(normalized);

  res.status(201).json({
    contactId: normalized,
    alias: alias || user?.alias || null,
    isBlocked: false,
    isMuted: false,
    isOnline: !!user?.is_online,
    lastSeen: user?.last_seen,
    publicKey: user?.public_key,
  });
}));

/**
 * PATCH /contacts/:contactId
 * Update contact alias
 */
router.patch("/:contactId", authenticate, asyncHandler(async (req, res) => {
  const { alias } = req.body;
  const contactId = req.params.contactId.toLowerCase();

  const contact = Contacts.find(req.user.wallet, contactId);
  if (!contact) return res.status(404).json({ error: "Contact not found" });

  Contacts.updateAlias(req.user.wallet, contactId, alias || null);
  res.json({ contactId, alias: alias || null });
}));

/**
 * POST /contacts/:contactId/block
 * Toggle block status
 */
router.post("/:contactId/block", authenticate, asyncHandler(async (req, res) => {
  const contactId = req.params.contactId.toLowerCase();
  const contact = Contacts.find(req.user.wallet, contactId);
  if (!contact) return res.status(404).json({ error: "Contact not found" });

  Contacts.toggleBlock(req.user.wallet, contactId);
  const updated = Contacts.find(req.user.wallet, contactId);

  res.json({ contactId, isBlocked: !!updated.is_blocked });
}));

/**
 * POST /contacts/:contactId/mute
 * Toggle mute status
 */
router.post("/:contactId/mute", authenticate, asyncHandler(async (req, res) => {
  const contactId = req.params.contactId.toLowerCase();
  const contact = Contacts.find(req.user.wallet, contactId);
  if (!contact) return res.status(404).json({ error: "Contact not found" });

  Contacts.toggleMute(req.user.wallet, contactId);
  const updated = Contacts.find(req.user.wallet, contactId);

  res.json({ contactId, isMuted: !!updated.is_muted });
}));

/**
 * DELETE /contacts/:contactId
 * Remove contact
 */
router.delete("/:contactId", authenticate, asyncHandler(async (req, res) => {
  const contactId = req.params.contactId.toLowerCase();
  Contacts.remove(req.user.wallet, contactId);
  res.json({ success: true });
}));

module.exports = router;
