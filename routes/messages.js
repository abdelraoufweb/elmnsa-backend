// ==========================================
// MESSAGE ROUTES
// ==========================================

const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const ctrl = require('../controllers/messageController');

// ── Send a message ────────────────────────
// POST /api/messages/send
router.post('/send', authMiddleware, ctrl.sendMessage);

// ── Unread count (must be BEFORE /:threadId) ──
// GET /api/messages/unread/count
router.get('/unread/count', authMiddleware, ctrl.getUnreadCount);

// ── All threads (staff: admin/assistant/developer) ──
// GET /api/messages/threads
router.get('/threads', authMiddleware, ctrl.getAllThreads);

// ── Get all messages (with optional ?threadId=) ──
// GET /api/messages
router.get('/', authMiddleware, ctrl.getMessages);

// ── Get single thread messages ────────────
// GET /api/messages/:threadId
router.get('/:threadId', authMiddleware, ctrl.getThreadMessages);

// ── Mark single message as read ───────────
// PUT /api/messages/:messageId/read
router.put('/:messageId/read', authMiddleware, ctrl.markAsRead);

// ── Mark entire thread as read ────────────
// PUT /api/messages/thread/:threadId/read-all
router.put('/thread/:threadId/read-all', authMiddleware, ctrl.markThreadAsRead);

// ── Delete message ────────────────────────
// DELETE /api/messages/:messageId
router.delete('/:messageId', authMiddleware, ctrl.deleteMessage);

module.exports = router;
