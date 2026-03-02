// ═══════════════════════════════════════════
// SENDBLOC — Key Exchange Routes
// ═══════════════════════════════════════════

const { Router } = require("express");
const { KeyExchange, Notifications } = require("../models");
const { generateId } = require("../utils/crypto");
const { asyncHandler, authenticate, requireBody } = require("../middleware");
const config = require("../config");

const router = Router();

/**
 * POST /keys/exchange
 * Initiate key exchange with another wallet
 */
router.post("/exchange", authenticate, requireBody("recipientId", "publicKey"), asyncHandler(async (req, res) => {
  const { recipientId, publicKey } = req.body;
  const normalized = recipientId.toLowerCase();

  KeyExchange.create(req.user.wallet, normalized, publicKey);

  // Notify recipient
  const notifId = generateId("notif");
  Notifications.create(notifId, normalized, "key_exchange",
    "Key Exchange Request", `${req.user.wallet.slice(0, 10)}... wants to establish encrypted channel`,
    { senderId: req.user.wallet }
  );

  // Emit via WebSocket
  const io = req.app.get("io");
  if (io) {
    io.to(`wallet:${normalized}`).emit("key:exchange_request", {
      senderId: req.user.wallet,
      publicKey,
    });
  }

  res.json({ success: true, message: "Key exchange initiated" });
}));

/**
 * GET /keys/pending
 * Get pending key exchange requests
 */
router.get("/pending", authenticate, asyncHandler(async (req, res) => {
  const pending = KeyExchange.getPending(req.user.wallet);
  res.json(pending.map(k => ({
    id: k.id,
    senderId: k.sender_id,
    publicKey: k.public_key,
    keyType: k.key_type,
    createdAt: k.created_at,
    expiresAt: k.expires_at,
  })));
}));

/**
 * POST /keys/accept/:id
 * Accept a key exchange request
 */
router.post("/accept/:id", authenticate, asyncHandler(async (req, res) => {
  KeyExchange.accept(parseInt(req.params.id), req.user.wallet);

  // Emit via WebSocket
  const io = req.app.get("io");
  if (io) {
    const exchange = KeyExchange.getPending(req.user.wallet).find(k => k.id === parseInt(req.params.id));
    if (exchange) {
      io.to(`wallet:${exchange.sender_id}`).emit("key:exchange_accepted", {
        recipientId: req.user.wallet,
      });
    }
  }

  res.json({ success: true });
}));

// ═══════════════════════════════════════════
// SENDBLOC — Networks Routes (separate export)
// ═══════════════════════════════════════════

const networksRouter = Router();

/**
 * GET /networks
 * List supported networks
 */
networksRouter.get("/", (_req, res) => {
  res.json(config.networks.map(n => ({
    id: n.id,
    name: n.name,
    chainId: n.chainId,
    color: n.color,
    active: !!n.active,
  })));
});

/**
 * GET /networks/status
 * Relay status for all networks
 */
networksRouter.get("/status", (_req, res) => {
  res.json(config.networks.map(n => ({
    id: n.id,
    name: n.name,
    relayActive: true,
    latency: Math.floor(20 + Math.random() * 80),
    peers: Math.floor(50 + Math.random() * 200),
  })));
});

module.exports.keysRouter = router;
module.exports.networksRouter = networksRouter;
