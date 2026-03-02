const { Router } = require('express');
const { Notifications } = require('../models');
const { authenticate } = require('../middleware');

const router = Router();

// GET /notifications — list notifications
router.get('/', authenticate, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const list = Notifications.getForUser(req.user.id, limit);
  res.json(list);
});

// POST /notifications/:id/read — mark single notification as read
router.post('/:id/read', authenticate, (req, res) => {
  Notifications.markRead(req.params.id, req.user.id);
  res.json({ message: 'Notification marked as read' });
});

// POST /notifications/read-all — mark all notifications as read
router.post('/read-all', authenticate, (req, res) => {
  Notifications.markAllRead(req.user.id);
  res.json({ message: 'All notifications marked as read' });
});

module.exports = router;
