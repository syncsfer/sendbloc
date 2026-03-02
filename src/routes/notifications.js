const { Router } = require('express');
const { notifications } = require('../models');
const { authenticate } = require('../middleware');

const router = Router();

// GET /notifications — list notifications (paginated)
router.get('/', authenticate, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
  const offset = parseInt(req.query.offset, 10) || 0;
  const list = notifications.findByUser.all(req.user.id, limit, offset);
  res.json(list);
});

// POST /notifications/:id/read — mark single notification as read
router.post('/:id/read', authenticate, (req, res) => {
  notifications.markRead.run(req.params.id, req.user.id);
  res.json({ message: 'Notification marked as read' });
});

// POST /notifications/read-all — mark all notifications as read
router.post('/read-all', authenticate, (req, res) => {
  notifications.markAllRead.run(req.user.id);
  res.json({ message: 'All notifications marked as read' });
});

module.exports = router;
