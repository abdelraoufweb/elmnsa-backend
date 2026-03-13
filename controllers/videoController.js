const Video = require('../models/Video');
const AccessCode = require('../models/AccessCode');
const User = require('../models/User');
const VideoProgress = require('../models/VideoProgress');
const { validateFileContent } = require('../utils/fileValidators');
const { uploadFile, deleteFileFromR2 } = require('../services/s3Service');
const { deleteFile } = require('../middleware/fileUpload');

// ============================================
// PROGRESS ENDPOINTS
// ============================================

/**
 * Save video progress
 * POST /api/videos/:videoId/progress
 */
exports.saveProgress = async (req, res) => {
  try {
    const { progress, completed } = req.body;
    const { videoId } = req.params;

    if (progress === undefined) {
      return res.status(400).json({ success: false, message: 'Progress is required' });
    }

    // Validate progress numeric and in range 0-100 (percentage)
    const parsedProgress = Number(progress);
    if (Number.isNaN(parsedProgress) || parsedProgress < 0 || parsedProgress > 100) {
      return res.status(400).json({ success: false, message: 'Invalid progress: must be a number between 0 and 100' });
    }

    const videoProgress = await VideoProgress.findOneAndUpdate(
      { user: req.user.id, video: videoId },
      {
        $set: {
          progress: parsedProgress,
          lastWatched: Date.now(),
          ...(typeof completed !== 'undefined' && { completed: Boolean(completed) })
        }
      },
      { new: true, upsert: true }
    );

    res.status(200).json({ success: true, data: videoProgress });
  } catch (error) {
    console.error('Save progress error:', error);
    res.status(500).json({ success: false, message: 'Failed to save progress' });
  }
};

/**
 * Get video progress
 * GET /api/videos/:videoId/progress
 */
exports.getProgress = async (req, res) => {
  try {
    const { videoId } = req.params;

    const videoProgress = await VideoProgress.findOne({
      user: req.user.id,
      video: videoId
    });

    res.status(200).json({
      success: true,
      data: videoProgress || { progress: 0, completed: false }
    });
  } catch (error) {
    console.error('Get progress error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch progress' });
  }
};

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
      .limit(parseInt(limit))
      .lean();

    // Count total
    const total = await Video.countDocuments(query);

    // Sanitize for students without access
    if (req.user && req.user.role === 'student' && !req.user.videoAccessUnlocked) {
      // Convert to plain objects and remove sensitive fields
      const sanitizedVideos = videos.map(v => {
        // If video is public, don't sanitize its URLs
        if (v.isPublic) return v;

        const video = { ...v };
        delete video.mp4Url;
        delete video.mp4Path;
        delete video.youtubeUrl;
        delete video.youtubeId;
        return video;
      });

      return res.status(200).json({
        success: true,
        data: sanitizedVideos,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit)
        }
      });
    }

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

    // Authorization check for students (guard in case req.user is not present)
    if (req.user?.role === 'student' && !req.user?.videoAccessUnlocked) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Please purchase video access to view this content.'
      });
    }

    // Atomic increment views (fix race condition)
    await Video.findByIdAndUpdate(req.params.videoId, { $inc: { views: 1 } });

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
    const { title, description, youtubeUrl, mp4Url, curriculum, grade, supportedQualities, defaultQuality, isPublic } = req.body;

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
      isPublic: isPublic === true || isPublic === 'true',
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

    // Authorization - only creator, admin, or developer can upload
    if (video.createdBy.toString() !== req.user.id && !['admin', 'developer'].includes(req.user.role)) {
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

    // MAGIC BYTE VALIDATION
    const isValidFile = await validateFileContent(req.file.path, 'video/mp4');
    if (!isValidFile) {
      const fs = require('fs');
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);

      return res.status(400).json({
        success: false,
        message: 'Invalid file content (spoofed extension detected)',
        error: 'INVALID_FILE_CONTENT'
      });
    }

    // UPLOAD TO CLOUDFLARE R2
    console.log('📤 Uploading to Cloudflare R2...');
    const r2Url = await uploadFile(req.file, 'videos');
    console.log('✅ Uploaded to R2:', r2Url);

    // Update database
    video.mp4Url = r2Url;
    video.mp4Path = null; // We don't need local path anymore
    video.status = 'published';
    video.updatedAt = new Date();
    await video.save();

    res.status(200).json({
      success: true,
      message: 'MP4 uploaded to Cloud Storage successfully',
      data: {
        mp4Url: video.mp4Url
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
    if (video.createdBy.toString() !== req.user.id && !['admin', 'developer'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to edit this video'
      });
    }

    // Update fields
    const { title, description, youtubeUrl, mp4Url, curriculum, grade, status, isPublic } = req.body;

    if (title) video.title = title;
    if (description) video.description = description;
    if (youtubeUrl) video.youtubeUrl = youtubeUrl;
    if (mp4Url) video.mp4Url = mp4Url;
    if (curriculum) video.curriculum = curriculum;
    if (grade) video.grade = parseInt(grade);
    if (status && ['draft', 'published', 'archived'].includes(status)) {
      video.status = status;
    }
    if (typeof isPublic !== 'undefined') {
      video.isPublic = isPublic === true || isPublic === 'true';
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
    if (video.createdBy.toString() !== req.user.id && !['admin', 'developer'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to delete this video'
      });
    }

    // DELETE FROM STORAGE (R2 OR LOCAL)
    if (video.mp4Url) {
      await deleteFile(video.mp4Url);
    }
    if (video.mp4Path) {
      await deleteFile(video.mp4Path);
    }

    await Video.findByIdAndDelete(req.params.videoId);

    res.status(200).json({
      success: true,
      message: 'Video and associated files deleted successfully'
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
