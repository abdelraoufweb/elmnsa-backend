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
    cb(null, `${timestamp}-${file.originalname}`);
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

// Public Routes

/**
 * List videos with filtering
 * GET /api/videos?grade=10&curriculum=american&page=1&limit=10
 */
router.get('/', videoController.listVideos);

/**
 * Get video details
 * GET /api/videos/:videoId
 */
router.get('/:videoId', videoController.getVideo);

// Protected Routes (Requires authentication)

/**
 * Create video
 * POST /api/videos
 * Allowed roles: admin, assistant, developer
 */
router.post('/', authMiddleware, videoController.createVideo);

/**
 * Update video
 * PUT /api/videos/:videoId
 * Creator or Admin only
 */
router.put('/:videoId', authMiddleware, videoController.updateVideo);

/**
 * Delete video
 * DELETE /api/videos/:videoId
 * Creator or Admin only
 */
router.delete('/:videoId', authMiddleware, videoController.deleteVideo);

/**
 * Upload MP4 file
 * POST /api/videos/:videoId/upload-mp4
 * Content-Type: multipart/form-data
 */
router.post('/:videoId/upload-mp4', authMiddleware, upload.single('file'), videoController.uploadMP4);

/**
 * Create access codes for video
 * POST /api/videos/:videoId/access-codes
 */
router.post('/:videoId/access-codes', authMiddleware, videoController.createAccessCodes);

/**
 * Get access codes for video
 * GET /api/videos/:videoId/access-codes
 * Admin or Developer only
 */
router.get('/:videoId/access-codes', authMiddleware, videoController.getAccessCodes);

module.exports = router;
