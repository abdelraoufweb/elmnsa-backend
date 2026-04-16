const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const { authMiddleware } = require('../middleware/auth');

// All notification routes require authentication
router.use(authMiddleware);

/**
 * Subscribe to Web Push notifications
 * POST /api/notifications/subscribe
 */
router.post('/subscribe', notificationController.subscribe);

/**
 * Get notification history
 * GET /api/notifications
 */
router.get('/', notificationController.getNotifications);

/**
 * Mark all as read
 * PATCH /api/notifications/read-all
 */
router.patch('/read-all', notificationController.markAllAsRead);

/**
 * Mark specific as read
 * PATCH /api/notifications/:id/read
 */
router.patch('/:id/read', notificationController.markAsRead);

module.exports = router;
