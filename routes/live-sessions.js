const express = require('express');
const router = express.Router();
const liveController = require('../controllers/liveController');
const { authMiddleware } = require('../middleware/auth');
const multer = require('multer');

// Configure temporary storage for recordings before S3 upload
const upload = multer({ dest: 'uploads/temp/' });

// GET /api/live-sessions — List active sessions
router.get('/', authMiddleware, liveController.getActiveSessions);

// POST /api/live-sessions/validate-code — Validate session code (MUST be called before opening camera)
router.post('/validate-code', authMiddleware, liveController.validateCode);

// POST /api/live-sessions/create — Create session via REST API
router.post('/create', authMiddleware, liveController.createSession);

// POST /api/live-sessions/:code/recording — Upload recording
router.post('/:code/recording', authMiddleware, upload.single('recording'), liveController.uploadRecording);

// POST /api/live-sessions/:code/share-file — Upload a shared file
router.post('/:code/share-file', authMiddleware, upload.single('file'), liveController.uploadSharedFile);

// POST /api/live-sessions/:code/zones — Create a zone
router.post('/:code/zones', authMiddleware, liveController.createZone);

// GET /api/live-sessions/:code/zones — List zones
router.get('/:code/zones', authMiddleware, liveController.getZones);

// POST /api/live-sessions/:code/zones/:zoneId/join — Join a zone
router.post('/:code/zones/:zoneId/join', authMiddleware, liveController.joinZone);

module.exports = router;
