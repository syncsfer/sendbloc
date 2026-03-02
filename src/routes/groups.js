// ═══════════════════════════════════════════
// SENDBLOC — Groups Routes
// ═══════════════════════════════════════════

const { Router } = require("express");
const { Groups, Messages, Notifications } = require("../models");
const { generateId } = require("../utils/crypto");
const { asyncHandler, authenticate, requireBody } = require("../middleware");

const router = Router();

/**
 * GET /groups
 * List all groups for current user
 */
router.get("/", authenticate, asyncHandler(async (req, res) => {
  const groups = Groups.getForUser(req.user.wallet);

  res.json(groups.map(g => ({
    id: g.id,
    name: g.name,
    description: g.description,
    creatorId: g.creator_id,
    memberCount: g.member_count,
    role: g.role,
    isEncrypted: !!g.is_encrypted,
    createdAt: g.created_at,
  })));
}));

/**
 * POST /groups
 * Create a new group
 */
router.post("/", authenticate, requireBody("name", "members"), asyncHandler(async (req, res) => {
  const { name, members, description } = req.body;

  if (!name?.trim()) return res.status(400).json({ error: "Group name required" });
  if (!Array.isArray(members) || members.length < 1) {
    return res.status(400).json({ error: "At least 1 member required" });
  }
  if (members.length > 255) {
    return res.status(400).json({ error: "Maximum 256 members per group" });
  }

  const groupId = generateId("group");
  Groups.create(groupId, name.trim(), req.user.wallet, description || null);

  // Add creator as admin
  Groups.addMember(groupId, req.user.wallet, "admin");

  // Add members
  for (const memberId of members) {
    Groups.addMember(groupId, memberId.toLowerCase(), "member");
  }

  // System message
  const msgId = generateId("msg");
  Messages.create({
    id: msgId,
    conversationId: groupId,
    senderId: "system",
    recipientId: null,
    type: "system",
    content: `Group "${name}" created by ${req.user.wallet.slice(0, 10)}...`,
    reactions: [],
  });

  // Notify members
  for (const memberId of members) {
    const notifId = generateId("notif");
    Notifications.create(notifId, memberId.toLowerCase(), "group_invite",
      "Added to Group", `You were added to "${name}"`,
      { groupId, addedBy: req.user.wallet }
    );
  }

  // Emit via WebSocket
  const io = req.app.get("io");
  if (io) {
    members.forEach(m => {
      io.to(`wallet:${m.toLowerCase()}`).emit("group:created", { groupId, name });
    });
  }

  const group = Groups.findById(groupId);
  const memberList = Groups.getMembers(groupId);

  res.status(201).json({
    id: groupId,
    name: group.name,
    description: group.description,
    creatorId: group.creator_id,
    members: memberList.map(m => ({
      userId: m.user_id,
      alias: m.alias,
      role: m.role,
      isOnline: !!m.is_online,
    })),
    createdAt: group.created_at,
  });
}));

/**
 * GET /groups/:groupId
 * Get group details with members
 */
router.get("/:groupId", authenticate, asyncHandler(async (req, res) => {
  const group = Groups.findById(req.params.groupId);
  if (!group) return res.status(404).json({ error: "Group not found" });

  if (!Groups.isMember(req.params.groupId, req.user.wallet)) {
    return res.status(403).json({ error: "Not a member of this group" });
  }

  const members = Groups.getMembers(req.params.groupId);

  res.json({
    id: group.id,
    name: group.name,
    description: group.description,
    creatorId: group.creator_id,
    isEncrypted: !!group.is_encrypted,
    maxMembers: group.max_members,
    members: members.map(m => ({
      userId: m.user_id,
      alias: m.alias,
      role: m.role,
      isOnline: !!m.is_online,
      lastSeen: m.last_seen,
      joinedAt: m.joined_at,
    })),
    createdAt: group.created_at,
    updatedAt: group.updated_at,
  });
}));

/**
 * PATCH /groups/:groupId
 * Update group (admin only)
 */
router.patch("/:groupId", authenticate, asyncHandler(async (req, res) => {
  const role = Groups.getMemberRole(req.params.groupId, req.user.wallet);
  if (role !== "admin") return res.status(403).json({ error: "Admin privileges required" });

  const { name, description } = req.body;
  Groups.update(req.params.groupId, { name, description });

  const updated = Groups.findById(req.params.groupId);
  res.json({ id: updated.id, name: updated.name, description: updated.description });
}));

/**
 * POST /groups/:groupId/members
 * Add members to group (admin/moderator only)
 */
router.post("/:groupId/members", authenticate, requireBody("userIds"), asyncHandler(async (req, res) => {
  const role = Groups.getMemberRole(req.params.groupId, req.user.wallet);
  if (!["admin", "moderator"].includes(role)) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }

  const { userIds } = req.body;
  const added = [];

  for (const userId of userIds) {
    const normalized = userId.toLowerCase();
    if (!Groups.isMember(req.params.groupId, normalized)) {
      Groups.addMember(req.params.groupId, normalized, "member");
      added.push(normalized);

      // System message
      const msgId = generateId("msg");
      Messages.create({
        id: msgId, conversationId: req.params.groupId,
        senderId: "system", type: "system",
        content: `${normalized.slice(0, 10)}... was added to the group`,
        reactions: [],
      });
    }
  }

  // Emit via WebSocket
  const io = req.app.get("io");
  if (io) {
    added.forEach(userId => {
      io.to(`wallet:${userId}`).emit("group:member_added", {
        groupId: req.params.groupId, userId,
      });
    });
  }

  res.json({ added });
}));

/**
 * DELETE /groups/:groupId/members/:userId
 * Remove member from group (admin only, or self-remove)
 */
router.delete("/:groupId/members/:userId", authenticate, asyncHandler(async (req, res) => {
  const targetUser = req.params.userId.toLowerCase();
  const isSelf = targetUser === req.user.wallet;

  if (!isSelf) {
    const role = Groups.getMemberRole(req.params.groupId, req.user.wallet);
    if (role !== "admin") return res.status(403).json({ error: "Admin privileges required" });
  }

  Groups.removeMember(req.params.groupId, targetUser);

  // System message
  const msgId = generateId("msg");
  Messages.create({
    id: msgId, conversationId: req.params.groupId,
    senderId: "system", type: "system",
    content: isSelf ? `${targetUser.slice(0, 10)}... left the group` : `${targetUser.slice(0, 10)}... was removed`,
    reactions: [],
  });

  res.json({ success: true });
}));

/**
 * POST /groups/:groupId/leave
 * Leave a group
 */
router.post("/:groupId/leave", authenticate, asyncHandler(async (req, res) => {
  Groups.removeMember(req.params.groupId, req.user.wallet);

  const msgId = generateId("msg");
  Messages.create({
    id: msgId, conversationId: req.params.groupId,
    senderId: "system", type: "system",
    content: `${req.user.wallet.slice(0, 10)}... left the group`,
    reactions: [],
  });

  res.json({ success: true });
}));

/**
 * DELETE /groups/:groupId
 * Delete group (creator/admin only)
 */
router.delete("/:groupId", authenticate, asyncHandler(async (req, res) => {
  const group = Groups.findById(req.params.groupId);
  if (!group) return res.status(404).json({ error: "Group not found" });

  if (group.creator_id !== req.user.wallet) {
    return res.status(403).json({ error: "Only the creator can delete the group" });
  }

  Groups.delete(req.params.groupId);
  res.json({ success: true });
}));

module.exports = router;
