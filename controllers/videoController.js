// ==========================================
// VIDEO CONTROLLER
// ==========================================

const Video = require('../models/Video');
const AccessCode = require('../models/AccessCode');
const User = require('../models/User');

// ============================================
// PUBLIC ENDPOINTS
// ============================================

/**
 * List videos with filtering and pagination
 * GET /api/videos?grade=10&curriculum=american&page=1&limit=10
 */
exports.listVideos = async (req, res) => {
  try {
    const { grade, curriculum, page = 1, limit = 10 } = req.query;

    // Build query
    const query = { status: 'published' };
    if (grade) query.grade = parseInt(grade);
    if (curriculum) query.curriculum = curriculum;

    // Pagination
    const skip = (page - 1) * limit;

    // Fetch videos
    const videos = await Video.find(query)
      .populate('createdBy', 'firstName lastName role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Count total
    const total = await Video.countDocuments(query);

    res.status(200).json({
      success: true,
      data: videos,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('List videos error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch videos',
      error: error.message
    });
  }
};

/**
 * Get single video details
 * GET /api/videos/:videoId
 */
exports.getVideo = async (req, res) => {
  try {
    const video = await Video.findById(req.params.videoId)
      .populate('createdBy', 'firstName lastName role');

    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }

    // Increment views
    video.views = (video.views || 0) + 1;
    await video.save();

    res.status(200).json({
      success: true,
      data: video
    });
  } catch (error) {
    console.error('Get video error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch video',
      error: error.message
    });
  }
};

// ============================================
// PROTECTED ENDPOINTS (Authenticated users)
// ============================================

/**
 * Create video (Admin, Assistant, Developer only)
 * POST /api/videos
 */
exports.createVideo = async (req, res) => {
  try {
    const { title, description, youtubeUrl, mp4Url, curriculum, grade, supportedQualities, defaultQuality } = req.body;

    // Authorization
    const allowedRoles = ['admin', 'assistant', 'developer'];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin, assistant, or developer can create videos'
      });
    }

    // Validation
    if (!title || !curriculum || !grade) {
      return res.status(400).json({
        success: false,
        message: 'Title, curriculum, and grade are required'
      });
    }

    // At least one media source required
    if (!youtubeUrl && !mp4Url) {
      return res.status(400).json({
        success: false,
        message: 'Either YouTube URL or MP4 URL must be provided'
      });
    }

    // Create video
    const video = new Video({
      title,
      description: description || null,
      youtubeUrl: youtubeUrl || null,
      mp4Url: mp4Url || null,
      curriculum,
      grade: parseInt(grade),
      supportedQualities: supportedQualities || ['720p'],
      defaultQuality: defaultQuality || '720p',
      createdBy: req.user.id,
      createdByRole: req.user.role,
      status: 'published'
    });

    // Extract YouTube ID if URL provided
    if (youtubeUrl) {
      const youtubeRegex = /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/;
      const match = youtubeUrl.match(youtubeRegex);
      if (match) video.youtubeId = match[1];
    }

    await video.save();

    res.status(201).json({
      success: true,
      message: 'Video created successfully',
      data: {
        id: video._id,
        title: video.title,
        createdAt: video.createdAt,
        youtubeId: video.youtubeId
      }
    });
  } catch (error) {
    console.error('Create video error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create video',
      error: error.message
    });
  }
};

/**
 * Upload MP4 file for video
 * POST /api/videos/:videoId/upload-mp4
 * Content-Type: multipart/form-data
 */
exports.uploadMP4 = async (req, res) => {
  try {
    const video = await Video.findById(req.params.videoId);

    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }

    // Authorization - only creator or admin can upload
    if (video.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to upload for this video'
      });
    }

    // Check if file provided
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file provided'
      });
    }

    // Store file path
    video.mp4Path = req.file.path;
    video.mp4Url = `/uploads/videos/${req.file.filename}`;
    await video.save();

    res.status(200).json({
      success: true,
      message: 'MP4 uploaded successfully',
      data: {
        mp4Url: video.mp4Url,
        fileSize: req.file.size
      }
    });
  } catch (error) {
    console.error('Upload MP4 error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload MP4',
      error: error.message
    });
  }
};

/**
 * Edit video (Creator or Admin only)
 * PUT /api/videos/:videoId
 */
exports.updateVideo = async (req, res) => {
  try {
    const video = await Video.findById(req.params.videoId);

    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }

    // Authorization
    if (video.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to edit this video'
      });
    }

    // Update fields
    const { title, description, youtubeUrl, mp4Url, curriculum, grade, status } = req.body;

    if (title) video.title = title;
    if (description) video.description = description;
    if (youtubeUrl) video.youtubeUrl = youtubeUrl;
    if (mp4Url) video.mp4Url = mp4Url;
    if (curriculum) video.curriculum = curriculum;
    if (grade) video.grade = parseInt(grade);
    if (status && ['draft', 'published', 'archived'].includes(status)) {
      video.status = status;
    }

    await video.save();

    res.status(200).json({
      success: true,
      message: 'Video updated successfully',
      data: video
    });
  } catch (error) {
    console.error('Update video error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update video',
      error: error.message
    });
  }
};

/**
 * Delete video (Creator or Admin only)
 * DELETE /api/videos/:videoId
 */
exports.deleteVideo = async (req, res) => {
  try {
    const video = await Video.findById(req.params.videoId);

    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }

    // Authorization
    if (video.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to delete this video'
      });
    }

    await Video.findByIdAndDelete(req.params.videoId);

    res.status(200).json({
      success: true,
      message: 'Video deleted successfully'
    });
  } catch (error) {
    console.error('Delete video error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete video',
      error: error.message
    });
  }
};

/**
 * Create access codes for video
 * POST /api/videos/:videoId/access-codes
 */
exports.createAccessCodes = async (req, res) => {
  try {
    const { codes } = req.body;  // Array of code objects

    if (!Array.isArray(codes) || codes.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Codes array required'
      });
    }

    const video = await Video.findById(req.params.videoId);
    if (!video) {
      return res.status(404).json({
        success: false,
        message: 'Video not found'
      });
    }

    // Create codes
    const createdCodes = await Promise.all(
      codes.map(codeData =>
        AccessCode.create({
          code: codeData.code,
          type: 'video',
          maxUsers: codeData.maxUsers || null,
          expiryDate: codeData.expiryDays
            ? new Date(Date.now() + codeData.expiryDays * 24 * 60 * 60 * 1000)
            : null,
          createdBy: req.user.id,
          linkedResource: video._id
        })
      )
    );

    res.status(201).json({
      success: true,
      message: 'Access codes created',
      data: {
        codesCreated: createdCodes.length,
        codes: createdCodes.map(c => ({
          id: c._id,
          code: c.code,
          expiryDate: c.expiryDate
        }))
      }
    });
  } catch (error) {
    console.error('Create access codes error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create access codes',
      error: error.message
    });
  }
};

/**
 * Get video access codes (Admin/Developer only)
 * GET /api/videos/:videoId/access-codes
 */
exports.getAccessCodes = async (req, res) => {
  try {
    // Authorization
    if (!['admin', 'developer'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin or developer can view access codes'
      });
    }

    const codes = await AccessCode.find({
      linkedResource: req.params.videoId,
      type: 'video'
    });

    res.status(200).json({
      success: true,
      data: codes
    });
  } catch (error) {
    console.error('Get access codes error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch access codes',
      error: error.message
    });
  }
};
