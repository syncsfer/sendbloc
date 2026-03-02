const { Router } = require('express');
const { contacts, users } = require('../models');
const { authenticate, requireBody } = require('../middleware');

const router = Router();

// GET /contacts — list all contacts
router.get('/', authenticate, (req, res) => {
  const list = contacts.findByUser.all(req.user.id);
  res.json(list);
});

// POST /contacts — add contact
router.post('/', authenticate, requireBody('wallet'), (req, res) => {
  const { wallet, alias } = req.body;
  const contactUser = users.findByWallet.get(wallet.toLowerCase());
  if (!contactUser) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (contactUser.id === req.user.id) {
    return res.status(400).json({ error: 'Cannot add yourself as a contact' });
  }

  const existing = contacts.findByPair.get(req.user.id, contactUser.id);
  if (existing) {
    return res.status(409).json({ error: 'Contact already exists' });
  }

  const result = contacts.create.run(req.user.id, contactUser.id, alias || null);
  res.status(201).json({ id: result.lastInsertRowid, contact_id: contactUser.id, alias });
});

// PATCH /contacts/:id — update alias
router.patch('/:id', authenticate, (req, res) => {
  const { alias } = req.body;
  const contact = contacts.findById.get(req.params.id, req.user.id);
  if (!contact) {
    return res.status(404).json({ error: 'Contact not found' });
  }
  contacts.updateAlias.run(alias, req.params.id, req.user.id);
  res.json({ ...contact, alias });
});

// POST /contacts/:id/block — toggle block
router.post('/:id/block', authenticate, (req, res) => {
  const contact = contacts.findById.get(req.params.id, req.user.id);
  if (!contact) {
    return res.status(404).json({ error: 'Contact not found' });
  }
  contacts.toggleBlock.run(req.params.id, req.user.id);
  const updated = contacts.findById.get(req.params.id, req.user.id);
  res.json(updated);
});

// POST /contacts/:id/mute — toggle mute
router.post('/:id/mute', authenticate, (req, res) => {
  const contact = contacts.findById.get(req.params.id, req.user.id);
  if (!contact) {
    return res.status(404).json({ error: 'Contact not found' });
  }
  contacts.toggleMute.run(req.params.id, req.user.id);
  const updated = contacts.findById.get(req.params.id, req.user.id);
  res.json(updated);
});

// DELETE /contacts/:id — remove contact
router.delete('/:id', authenticate, (req, res) => {
  const contact = contacts.findById.get(req.params.id, req.user.id);
  if (!contact) {
    return res.status(404).json({ error: 'Contact not found' });
  }
  contacts.delete.run(req.params.id, req.user.id);
  res.json({ message: 'Contact removed' });
});

module.exports = router;
