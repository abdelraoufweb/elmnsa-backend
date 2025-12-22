// ==========================================
// MESSAGE ROUTES
// ==========================================

const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const messageController = require('../controllers/messageController');

// Send message
/**
 * POST /api/messages/send
 */
router.post('/send', authMiddleware, messageController.sendMessage);

// Get all messages with filtering
/**
 * GET /api/messages?threadId=chat:studentId&page=1&limit=20
 */
router.get('/', authMiddleware, messageController.getMessages);

// Get unread count
/**
 * GET /api/messages/unread/count
 */
router.get('/unread/count', authMiddleware, messageController.getUnreadCount);

// Get thread messages
/**
 * GET /api/messages/:threadId
 */
router.get('/:threadId', authMiddleware, messageController.getThreadMessages);

// Mark message as read
/**
 * PUT /api/messages/:messageId/read
 */
router.put('/:messageId/read', authMiddleware, messageController.markAsRead);

// Delete message
/**
 * DELETE /api/messages/:messageId
 */
router.delete('/:messageId', authMiddleware, messageController.deleteMessage);

module.exports = router;
