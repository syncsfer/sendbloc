const { Router } = require('express');
const { groups, groupMembers } = require('../models');
const { authenticate, requireBody } = require('../middleware');

const router = Router();

// GET /groups — list user's groups
router.get('/', authenticate, (req, res) => {
  const list = groups.findByUser.all(req.user.id);
  res.json(list);
});

// POST /groups — create group
router.post('/', authenticate, requireBody('name'), (req, res) => {
  const { name, description, avatar_url } = req.body;
  const result = groups.create.run(name, description || null, avatar_url || null, req.user.id);
  const groupId = result.lastInsertRowid;

  // Creator becomes admin
  groupMembers.add.run(groupId, req.user.id, 'admin');

  const group = groups.findById.get(groupId);

  // Notify via socket
  const io = req.app.get('io');
  if (io) {
    io.to(`user:${req.user.id}`).emit('group:created', { groupId, name });
  }

  res.status(201).json(group);
});

// GET /groups/:id — group details + members
router.get('/:id', authenticate, (req, res) => {
  const group = groups.findById.get(req.params.id);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }

  const membership = groupMembers.findMembership.get(group.id, req.user.id);
  if (!membership) {
    return res.status(403).json({ error: 'Not a member of this group' });
  }

  const members = groupMembers.findByGroup.all(group.id);
  res.json({ ...group, members });
});

// PATCH /groups/:id — update group (admin only)
router.patch('/:id', authenticate, (req, res) => {
  const group = groups.findById.get(req.params.id);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }

  const membership = groupMembers.findMembership.get(group.id, req.user.id);
  if (!membership || membership.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { name, description, avatar_url } = req.body;
  groups.update.run(
    name ?? group.name,
    description ?? group.description,
    avatar_url ?? group.avatar_url,
    group.id
  );

  const updated = groups.findById.get(group.id);
  res.json(updated);
});

// POST /groups/:id/members — add members
router.post('/:id/members', authenticate, requireBody('userIds'), (req, res) => {
  const group = groups.findById.get(req.params.id);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }

  const membership = groupMembers.findMembership.get(group.id, req.user.id);
  if (!membership || membership.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const { userIds } = req.body;
  const io = req.app.get('io');

  for (const userId of userIds) {
    groupMembers.add.run(group.id, userId, 'member');
    if (io) {
      io.to(`user:${userId}`).emit('group:created', { groupId: group.id, name: group.name });
      io.to(`group:${group.id}`).emit('group:member_added', { groupId: group.id, userId });
    }
  }

  const members = groupMembers.findByGroup.all(group.id);
  res.json(members);
});

// DELETE /groups/:id/members/:uid — remove member
router.delete('/:id/members/:uid', authenticate, (req, res) => {
  const group = groups.findById.get(req.params.id);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }

  const membership = groupMembers.findMembership.get(group.id, req.user.id);
  if (!membership || membership.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  groupMembers.remove.run(group.id, req.params.uid);
  res.json({ message: 'Member removed' });
});

// POST /groups/:id/leave — leave group
router.post('/:id/leave', authenticate, (req, res) => {
  const group = groups.findById.get(req.params.id);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }

  groupMembers.remove.run(group.id, req.user.id);
  res.json({ message: 'Left group' });
});

// DELETE /groups/:id — delete group (creator only)
router.delete('/:id', authenticate, (req, res) => {
  const group = groups.findById.get(req.params.id);
  if (!group) {
    return res.status(404).json({ error: 'Group not found' });
  }

  if (group.creator_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the creator can delete this group' });
  }

  groupMembers.removeAll.run(group.id);
  groups.delete.run(group.id);
  res.json({ message: 'Group deleted' });
});

module.exports = router;
