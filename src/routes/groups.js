const { Router } = require('express');
const crypto = require('crypto');
const { Groups } = require('../models');
const { authenticate, requireBody } = require('../middleware');

const router = Router();

// GET /groups — list user's groups
router.get('/', authenticate, (req, res) => {
  const list = Groups.getForUser(req.user.id);
  res.json(list);
});

// POST /groups — create group
router.post('/', authenticate, requireBody('name'), (req, res) => {
  const { name, description } = req.body;
  const groupId = `group_${crypto.randomUUID().slice(0, 8)}`;

  Groups.create(groupId, name, req.user.id, description || null);

  // Creator becomes admin
  Groups.addMember(groupId, req.user.id, 'admin');

  const group = Groups.findById(groupId);

  // Notify via socket
  const io = req.app.get('io');
  if (io) {
    io.to(`user:${req.user.id}`).emit('group:created', { groupId, name });
  }

  res.status(201).json(group);
});

// GET /groups/:id — group details + members
router.get('/:id', authenticate, (req, res) => {
  const group = Groups.findById(req.params.id);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }

  if (!Groups.isMember(group.id, req.user.id)) {
    return res.status(403).json({ error: 'Not a member of this group' });
  }

  const members = Groups.getMembers(group.id);
  res.json({ ...group, members });
});

// PATCH /groups/:id — update group (admin only)
router.patch('/:id', authenticate, (req, res) => {
  const group = Groups.findById(req.params.id);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }

  const role = Groups.getMemberRole(group.id, req.user.id);
  if (role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { name, description } = req.body;
  Groups.update(group.id, { name, description });

  const updated = Groups.findById(group.id);
  res.json(updated);
});

// POST /groups/:id/members — add members
router.post('/:id/members', authenticate, requireBody('userIds'), (req, res) => {
  const group = Groups.findById(req.params.id);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }

  const role = Groups.getMemberRole(group.id, req.user.id);
  if (role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { userIds } = req.body;
  const io = req.app.get('io');

  for (const userId of userIds) {
    Groups.addMember(group.id, userId, 'member');
    if (io) {
      io.to(`user:${userId}`).emit('group:created', { groupId: group.id, name: group.name });
      io.to(`group:${group.id}`).emit('group:member_added', { groupId: group.id, userId });
    }
  }

  const members = Groups.getMembers(group.id);
  res.json(members);
});

// DELETE /groups/:id/members/:uid — remove member
router.delete('/:id/members/:uid', authenticate, (req, res) => {
  const group = Groups.findById(req.params.id);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }

  const role = Groups.getMemberRole(group.id, req.user.id);
  if (role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  Groups.removeMember(group.id, req.params.uid);
  res.json({ message: 'Member removed' });
});

// POST /groups/:id/leave — leave group
router.post('/:id/leave', authenticate, (req, res) => {
  const group = Groups.findById(req.params.id);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }

  Groups.removeMember(group.id, req.user.id);
  res.json({ message: 'Left group' });
});

// DELETE /groups/:id — delete group (creator only)
router.delete('/:id', authenticate, (req, res) => {
  const group = Groups.findById(req.params.id);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }

  if (group.creator_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the creator can delete this group' });
  }

  // group_members cascade on delete
  Groups.delete(group.id);
  res.json({ message: 'Group deleted' });
});

module.exports = router;
