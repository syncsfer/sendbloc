const { Router } = require('express');
const { KeyExchange } = require('../models');
const { authenticate, requireBody } = require('../middleware');
const config = require('../config');

const router = Router();

// ── Key Exchange ────────────────────────────────────────────────────────────

// POST /keys/exchange — initiate key exchange
router.post('/keys/exchange', authenticate, requireBody('recipientId', 'publicKey'), (req, res) => {
  const { recipientId, publicKey } = req.body;

  const result = KeyExchange.create(req.user.id, recipientId, publicKey);

  // Notify recipient via Socket.IO
  const io = req.app.get('io');
  if (io) {
    io.to(`user:${recipientId}`).emit('key:exchange_request', {
      id: result.lastInsertRowid,
      senderId: req.user.id,
      publicKey,
    });
  }

  res.status(201).json({ id: result.lastInsertRowid });
});

// GET /keys/pending — pending key exchange requests
router.get('/keys/pending', authenticate, (req, res) => {
  const pending = KeyExchange.getPending(req.user.id);
  res.json(pending);
});

// POST /keys/accept/:id — accept key exchange
router.post('/keys/accept/:id', authenticate, (req, res) => {
  const result = KeyExchange.accept(req.params.id, req.user.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Key exchange not found or not authorized' });
  }

  res.json({ message: 'Key exchange accepted' });
});

// ── Networks ────────────────────────────────────────────────────────────────

// GET /networks — list supported networks (no auth)
router.get('/networks', (_req, res) => {
  res.json(config.networks);
});

// GET /networks/status — relay status (no auth)
router.get('/networks/status', (_req, res) => {
  res.json(
    config.networks.map((n) => ({ ...n, relayActive: true, relay: 'online' }))
  );
});

module.exports = router;
