// ==========================================
// VIDEO ROUTES
// ==========================================

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const videoController = require('../controllers/videoController');
const { authMiddleware, authorize } = require('../middleware/auth');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads/videos'));
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const safeFilename = path.basename(file.originalname);
    cb(null, `${timestamp}-${safeFilename}`);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    // Only accept MP4 files
    if (file.mimetype === 'video/mp4' || path.extname(file.originalname).toLowerCase() === '.mp4') {
      cb(null, true);
    } else {
      cb(new Error('Only MP4 files are allowed'), false);
    }
  },
  limits: {
    fileSize: process.env.MAX_FILE_SIZE || 524288000 // 500MB
  }
});

// Authenticated Routes (these endpoints require authMiddleware)

/**
 * List videos with filtering
 * GET /api/videos?grade=10&curriculum=american&page=1&limit=10
 */
router.get('/', authMiddleware, videoController.listVideos);

/**
 * Stream video (proxied, hides actual URL from client)
 * GET /api/videos/stream/:videoId
 * Must be before /:videoId to avoid route collision
 */
router.get('/stream/:videoId', authMiddleware, videoController.streamVideo);

/**
 * Get video details
 * GET /api/videos/:videoId
 */
router.get('/:videoId', authMiddleware, videoController.getVideo);

// Protected Routes (Requires authentication)

/**
 * Create video
 * POST /api/videos
 * Allowed roles: admin, assistant, developer
 */
router.post('/', authMiddleware, authorize(['admin', 'assistant', 'developer']), videoController.createVideo);

/**
 * Update video
 * PUT /api/videos/:videoId
 * Creator or Admin only
 */
router.put('/:videoId', authMiddleware, authorize(['admin', 'assistant', 'developer']), videoController.updateVideo);

/**
 * Delete video
 * DELETE /api/videos/:videoId
 * Creator or Admin only
 */
router.delete('/:videoId', authMiddleware, authorize(['admin', 'assistant', 'developer']), videoController.deleteVideo);

/**
 * Upload MP4 file
 * POST /api/videos/:videoId/upload-mp4
 * Content-Type: multipart/form-data
 */
router.post('/:videoId/upload-mp4', authMiddleware, authorize(['admin', 'assistant', 'developer']), upload.single('file'), videoController.uploadMP4);

/**
 * Create access codes for video
 * POST /api/videos/:videoId/access-codes
 */
router.post('/:videoId/access-codes', authMiddleware, authorize(['admin', 'assistant', 'developer']), videoController.createAccessCodes);

/**
 * Get access codes for video
 * GET /api/videos/:videoId/access-codes
 * Admin, Developer or Assistant only
 */
router.get('/:videoId/access-codes', authMiddleware, authorize(['admin', 'assistant', 'developer']), videoController.getAccessCodes);

/**
 * Edit access code
 * PUT /api/videos/access-codes/:codeId
 * Admin, Developer or Assistant only
 */
router.put('/access-codes/:codeId', authMiddleware, authorize(['admin', 'assistant', 'developer']), videoController.updateAccessCode);

/**
 * Mark access code as sold
 * PATCH /api/videos/access-codes/:codeId/sell
 */
router.patch('/access-codes/:codeId/sell', authMiddleware, authorize(['admin', 'assistant', 'developer']), videoController.sellCode);

/**
 * Mark a batch of video codes as saved to PDF
 * PATCH /api/videos/batch/:batchId/mark-pdf
 */
router.patch('/batch/:batchId/mark-pdf', authMiddleware, authorize(['admin', 'assistant', 'developer']), videoController.markBatchPdf);

/**
 * Unlock a specific video using an access code
 * POST /api/videos/:videoId/unlock
 */
router.post('/:videoId/unlock', authMiddleware, videoController.unlockVideo);

/**
 * Unlock a video using a code globally (determines video from code)
 * POST /api/videos/unlock
 */
router.post('/unlock', authMiddleware, videoController.unlockVideo);

/**
 * Get video progress
 * GET /api/videos/:videoId/progress
 */
router.get('/:videoId/progress', authMiddleware, videoController.getProgress);

/**
 * Save video progress
 * POST /api/videos/:videoId/progress
 */
router.post('/:videoId/progress', authMiddleware, videoController.saveProgress);

module.exports = router;
