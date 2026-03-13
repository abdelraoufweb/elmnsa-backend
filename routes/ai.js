// ==========================================
// AI CHAT ROUTES
// ==========================================

const express = require('express');
const router = express.Router();
const { authMiddleware, authorize } = require('../middleware/auth');
const aiController = require('../controllers/aiController');

// AI Routes
router.post('/chat', authMiddleware, aiController.getResponse);
router.post('/verify-access-code', authMiddleware, aiController.verifyAccessCode);
router.post('/generate-access-code', authMiddleware, authorize('admin', 'developer'), aiController.generateAccessCode);

// Conversation History
router.get('/conversation-history', authMiddleware, aiController.getConversationHistory);
router.delete('/clear-conversation', authMiddleware, aiController.clearConversation);

module.exports = router;
