const { Router } = require('express');
const { Contacts, Users } = require('../models');
const { authenticate, requireBody } = require('../middleware');

const router = Router();

// GET /contacts — list all contacts
router.get('/', authenticate, (req, res) => {
  const list = Contacts.getAll(req.user.id);
  res.json(list);
});

// POST /contacts — add contact
router.post('/', authenticate, requireBody('wallet'), (req, res) => {
  const { wallet, alias } = req.body;
  const contactUser = Users.findById(wallet.toLowerCase());
  if (!contactUser) {
    return res.status(404).json({ error: 'User not found' });
  }
  if (contactUser.id === req.user.id) {
    return res.status(400).json({ error: 'Cannot add yourself as a contact' });
  }

  const existing = Contacts.find(req.user.id, contactUser.id);
  if (existing) {
    return res.status(409).json({ error: 'Contact already exists' });
  }

  Contacts.add(req.user.id, contactUser.id, alias || null);
  res.status(201).json({ contact_id: contactUser.id, alias });
});

// PATCH /contacts/:id — update alias
router.patch('/:id', authenticate, (req, res) => {
  const { alias } = req.body;
  const contact = Contacts.find(req.user.id, req.params.id);
  if (!contact) {
    return res.status(404).json({ error: 'Contact not found' });
  }
  Contacts.updateAlias(req.user.id, req.params.id, alias);
  res.json({ ...contact, alias });
});

// POST /contacts/:id/block — toggle block
router.post('/:id/block', authenticate, (req, res) => {
  const contact = Contacts.find(req.user.id, req.params.id);
  if (!contact) {
    return res.status(404).json({ error: 'Contact not found' });
  }
  Contacts.toggleBlock(req.user.id, req.params.id);
  const updated = Contacts.find(req.user.id, req.params.id);
  res.json(updated);
});

// POST /contacts/:id/mute — toggle mute
router.post('/:id/mute', authenticate, (req, res) => {
  const contact = Contacts.find(req.user.id, req.params.id);
  if (!contact) {
    return res.status(404).json({ error: 'Contact not found' });
  }
  Contacts.toggleMute(req.user.id, req.params.id);
  const updated = Contacts.find(req.user.id, req.params.id);
  res.json(updated);
});

// DELETE /contacts/:id — remove contact
router.delete('/:id', authenticate, (req, res) => {
  const contact = Contacts.find(req.user.id, req.params.id);
  if (!contact) {
    return res.status(404).json({ error: 'Contact not found' });
  }
  Contacts.remove(req.user.id, req.params.id);
  res.json({ message: 'Contact removed' });
});

module.exports = router;
