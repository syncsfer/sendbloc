// ═══════════════════════════════════════════
// SENDBLOC — Notifications Routes
// ═══════════════════════════════════════════

const { Router } = require("express");
const { Notifications } = require("../models");
const { asyncHandler, authenticate } = require("../middleware");

const router = Router();

/**
 * GET /notifications
 */
router.get("/", authenticate, asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const notifications = Notifications.getForUser(req.user.wallet, limit);
  const unread = Notifications.getUnreadCount(req.user.wallet);

  res.json({
    unreadCount: unread.count,
    notifications: notifications.map(n => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      data: n.data ? JSON.parse(n.data) : null,
      isRead: !!n.is_read,
      createdAt: n.created_at,
    })),
  });
}));

/**
 * POST /notifications/:id/read
 */
router.post("/:id/read", authenticate, asyncHandler(async (req, res) => {
  Notifications.markRead(req.params.id, req.user.wallet);
  res.json({ success: true });
}));

/**
 * POST /notifications/read-all
 */
router.post("/read-all", authenticate, asyncHandler(async (req, res) => {
  Notifications.markAllRead(req.user.wallet);
  res.json({ success: true });
}));

module.exports = router;
