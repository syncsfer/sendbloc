const { Router } = require('express');
const { keyExchanges } = require('../models');
const { authenticate, requireBody } = require('../middleware');

const router = Router();

// ── Key Exchange ────────────────────────────────────────────────────────────

// POST /keys/exchange — initiate key exchange
router.post('/keys/exchange', authenticate, requireBody('recipientId', 'publicKey'), (req, res) => {
  const { recipientId, publicKey } = req.body;

  const result = keyExchanges.create.run(req.user.id, recipientId, publicKey);

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
  const pending = keyExchanges.findPending.all(req.user.id);
  res.json(pending);
});

// POST /keys/accept/:id — accept key exchange
router.post('/keys/accept/:id', authenticate, (req, res) => {
  const exchange = keyExchanges.findById.get(req.params.id);
  if (!exchange) {
    return res.status(404).json({ error: 'Key exchange not found' });
  }
  if (exchange.recipient_id !== req.user.id) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  keyExchanges.accept.run(exchange.id);

  // Notify sender
  const io = req.app.get('io');
  if (io) {
    io.to(`user:${exchange.sender_id}`).emit('key:exchange_accepted', {
      recipientId: req.user.id,
    });
  }

  res.json({ message: 'Key exchange accepted' });
});

// ── Networks ────────────────────────────────────────────────────────────────

const SUPPORTED_NETWORKS = [
  { id: 'ethereum', name: 'Ethereum', chainId: 1 },
  { id: 'polygon', name: 'Polygon', chainId: 137 },
  { id: 'arbitrum', name: 'Arbitrum', chainId: 42161 },
  { id: 'optimism', name: 'Optimism', chainId: 10 },
  { id: 'base', name: 'Base', chainId: 8453 },
];

// GET /networks — list supported networks (no auth)
router.get('/networks', (_req, res) => {
  res.json(SUPPORTED_NETWORKS);
});

// GET /networks/status — relay status (no auth)
router.get('/networks/status', (_req, res) => {
  res.json({
    status: 'operational',
    networks: SUPPORTED_NETWORKS.map((n) => ({ ...n, relay: 'online' })),
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
