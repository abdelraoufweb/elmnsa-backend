// ==========================================
// AI CHAT ROUTES
// ==========================================

const express = require('express');
const router = express.Router();
const { authenticateToken, authorize } = require('../middleware/auth');
const aiController = require('../controllers/aiController');

// AI Routes
router.post('/chat', authenticateToken, aiController.getResponse);
router.post('/verify-access-code', authenticateToken, aiController.verifyAccessCode);
router.post('/generate-access-code', authenticateToken, authorize('admin', 'developer'), aiController.generateAccessCode);

// Conversation History
router.get('/conversation-history', authenticateToken, aiController.getConversationHistory);
router.delete('/clear-conversation', authenticateToken, aiController.clearConversation);

module.exports = router;
