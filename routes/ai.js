// ==========================================
// AI CHAT ROUTES
// ==========================================

const express = require('express');
const router = express.Router();
const { authMiddleware, authorize } = require('../middleware/auth');
const aiController = require('../controllers/aiController');
const knowledgeController = require('../controllers/knowledgeController');

// AI Chat Routes
router.post('/chat', authMiddleware, aiController.getResponse);
router.post('/verify-access-code', authMiddleware, aiController.verifyAccessCode);
router.post('/generate-access-code', authMiddleware, authorize(['admin', 'developer']), aiController.generateAccessCode);
router.get('/access-status', authMiddleware, aiController.getAccessStatus);

// Conversation History
router.get('/conversation-history', authMiddleware, aiController.getConversationHistory);
router.delete('/clear-conversation', authMiddleware, aiController.clearConversation);

// Knowledge Base (Admin/Dev/Assistant)
router.post('/knowledge', authMiddleware, authorize(['admin', 'developer', 'assistant']), knowledgeController.upload);
router.get('/knowledge', authMiddleware, authorize(['admin', 'developer', 'assistant']), knowledgeController.list);
router.get('/knowledge/:id', authMiddleware, authorize(['admin', 'developer', 'assistant']), knowledgeController.getOne);
router.put('/knowledge/:id', authMiddleware, authorize(['admin', 'developer', 'assistant']), knowledgeController.update);
router.delete('/knowledge/:id', authMiddleware, authorize(['admin', 'developer', 'assistant']), knowledgeController.remove);

// AI Context for Voice (fetches knowledge + student notes)
router.get('/voice-context', authMiddleware, knowledgeController.getAIContext);

// Voice Token (secure key delivery)
router.get('/voice-token', authMiddleware, knowledgeController.getVoiceToken);

// Voice Chat — Gemini (text) + ElevenLabs (audio) fully on backend
router.post('/voice-chat', authMiddleware, aiController.voiceChat);

// Revoke AI access (admin/developer only)
router.post('/revoke-access', authMiddleware, authorize(['admin', 'developer']), aiController.revokeAccess);

// Student Notes (updated by voice AI via function calling)
router.post('/student-notes', authMiddleware, knowledgeController.updateStudentNotes);

module.exports = router;
