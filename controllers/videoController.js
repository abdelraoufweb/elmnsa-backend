const Video = require('../models/Video');
const AccessCode = require('../models/AccessCode');
const User = require('../models/User');
const VideoProgress = require('../models/VideoProgress');
const { validateFileContent } = require('../utils/fileValidators');
const { uploadFile, deleteFileFromR2 } = require('../services/s3Service');
const { deleteFile } = require('../middleware/fileUpload');
const https = require('https');
const http = require('http');
const urlMod = require('url');

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

    // ✅ Atomic upsert — eliminates read-modify-write race condition
    const updateFields = {
      progress: parsedProgress,
      lastWatched: Date.now()
    };
    if (typeof completed !== 'undefined') {
      updateFields.completed = Boolean(completed);
    }

    const videoProgress = await VideoProgress.findOneAndUpdate(
      { user: req.user.id, video: videoId },
      { $set: updateFields },
      { new: true, upsert: true, setDefaultsOnInsert: true }
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
    const { grade, curriculum, page = 1, limit = 10000 } = req.query;

    // Build query
    const query = { status: 'published' };
    
    // 🎯 ENFORCE GRADE/CURRICULUM FILTERING FOR STUDENTS
    // This ensures students only see content for their specific stage
    if (req.user && req.user.role === 'student') {
      // Use req.user.grade if available, ensure it's a Number
      if (req.user.grade !== undefined && req.user.grade !== null) {
        query.grade = Number(req.user.grade);
      }
      
      // Use req.user.curriculum if available
      if (req.user.curriculum) {
        query.curriculum = req.user.curriculum;
      }
      
      console.log(`🔒 [VIDEOS] Enforcing student filters for ${req.user.firstName}: Grade ${query.grade}, Curriculum ${query.curriculum}`);
    } else {
      // Admins/Assistants/Developers can use query parameters
      if (grade) {
        const parsedGrade = parseInt(grade);
        if (!isNaN(parsedGrade)) query.grade = parsedGrade;
      }
      if (curriculum) query.curriculum = curriculum;
    }

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

    // 🧹 Purge expired unlockedVideos for students before listing
    if (req.user && req.user.role === 'student') {
      try {
        await User.findByIdAndUpdate(req.user.id, {
          $pull: { unlockedVideos: { expiryDate: { $lt: new Date() } } }
        });
      } catch (pullErr) {
        console.error('Expiry purge error:', pullErr);
      }
    }

    // Strip raw video URLs from student responses (use stream endpoint instead)
    if (req.user && req.user.role === 'student') {
      const sanitizedVideos = videos.map(v => {
        const video = { ...v };
        // Always strip mp4Url — student must use /api/videos/stream/:id
        delete video.mp4Url;
        delete video.mp4Path;
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

    // 🧹 Purge expired unlockedVideos for students before access check
    if (req.user?.role === 'student') {
      try {
        await User.findByIdAndUpdate(req.user.id, {
          $pull: { unlockedVideos: { expiryDate: { $lt: new Date() } } }
        });
      } catch (pullErr) {
        console.error('Expiry purge error:', pullErr);
      }
    }

    // Authorization check for students (guard in case req.user is not present)
    if (req.user?.role === 'student' && !req.user?.videoAccessUnlocked && !video.isPublic) {
      // Check if specifically unlocked
      const unlocked = (req.user.unlockedVideos || []).some(uv => uv.videoId.toString() === req.params.videoId);
      
      if (!unlocked) {
        return res.status(403).json({
          success: false,
          message: 'Access denied. Please purchase video access to view this content.'
        });
      }
    }

    // Atomic increment views (fix race condition)
    await Video.findByIdAndUpdate(req.params.videoId, { $inc: { views: 1 } });

    // Strip raw URL from student response (use stream endpoint instead)
    if (req.user?.role === 'student') {
      const data = video.toObject ? video.toObject() : { ...video };
      delete data.mp4Url;
      delete data.mp4Path;
      return res.status(200).json({
        success: true,
        data
      });
    }

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
// STREAM ENDPOINT (proxy R2 URL, hides actual link)
// ============================================

/**
 * Stream video via proxy (hides actual R2 URL from client)
 * GET /api/videos/stream/:videoId
 */
exports.streamVideo = async (req, res) => {
  try {
    const video = await Video.findById(req.params.videoId);
    if (!video) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }

    // Access check (same as getVideo)
    if (req.user?.role === 'student' && !req.user?.videoAccessUnlocked && !video.isPublic) {
      const unlocked = (req.user.unlockedVideos || []).some(uv => uv.videoId.toString() === req.params.videoId);
      if (!unlocked) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }
    }

    if (!video.mp4Url && !video.youtubeUrl) {
      return res.status(404).json({ success: false, message: 'No video source available' });
    }

    // YouTube — redirect to embed (URL is inherently public)
    if (video.youtubeUrl && !video.mp4Url) {
      const m = video.youtubeUrl.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      if (m) {
        return res.redirect(`https://www.youtube.com/embed/${m[1]}?autoplay=1&modestbranding=1&rel=0`);
      }
      return res.status(400).json({ success: false, message: 'Invalid YouTube URL' });
    }

    // MP4 — proxy from R2 (actual URL never reaches client)
    const videoUrl = video.mp4Url;
    const parsedUrl = urlMod.parse(videoUrl);
    const httpModule = parsedUrl.protocol === 'https:' ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.path,
      method: 'GET',
      headers: {}
    };

    // Forward Range header for seeking support
    if (req.headers.range) {
      options.headers.range = req.headers.range;
    }

    const proxyReq = httpModule.request(options, (proxyRes) => {
      const statusCode = proxyRes.statusCode || 200;

      // Forward relevant headers
      if (proxyRes.headers['content-type']) {
        res.setHeader('Content-Type', proxyRes.headers['content-type']);
      }
      if (proxyRes.headers['content-length']) {
        res.setHeader('Content-Length', proxyRes.headers['content-length']);
      }
      if (proxyRes.headers['content-range']) {
        res.setHeader('Content-Range', proxyRes.headers['content-range']);
      }
      if (proxyRes.headers['accept-ranges']) {
        res.setHeader('Accept-Ranges', proxyRes.headers['accept-ranges']);
      }
      if (proxyRes.headers['cache-control']) {
        res.setHeader('Cache-Control', proxyRes.headers['cache-control']);
      }

      res.writeHead(statusCode);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error('Stream proxy error:', err);
      if (!res.headersSent) {
        res.status(502).json({ success: false, message: 'Failed to stream video' });
      }
    });

    proxyReq.end();
  } catch (error) {
    console.error('Stream video error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
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

    // ── Notify Group ──────────
    const notificationService = require('../services/notificationService');
    notificationService.notifyGroup(
      { grade: video.grade, curriculum: video.curriculum },
      {
        title: 'فيديو جديد متاح! 🎥',
        message: `تم رفع فيديو جديد: ${video.title}`,
        type: 'video',
        refId: video._id,
        url: '/student-videos',
        notifyParent: true // User requested parents get these too
      },
      req.io
    );

    // ── WhatsApp Notification: New Video to active students ──────────
    try {
      const whatsappService = require('../services/whatsappService');
      const User = require('../models/User');
      
      // Find active students in matching grade & curriculum
      const targetStudents = await User.find({
        role: 'student',
        status: 'approved',
        grade: video.grade,
        curriculum: video.curriculum
      }).select('firstName lastName phoneNumber');

      if (targetStudents.length > 0) {
        const recipients = targetStudents.map(s => ({
          phone: s.phoneNumber,
          message: `🎥 *فيديو جديد متاح!*\n\n📺 ${video.title}\n${video.description ? `📝 ${video.description}\n` : ''}\n✅ شاهد الفيديو الآن من المنصة`,
          logData: {
            type: 'content',
            studentId: s._id,
            recipientName: `${s.firstName} ${s.lastName}`,
            recipientType: 'student'
          }
        }));
        whatsappService.sendBatch(recipients);
        console.log(`📱 [WhatsApp] Queued ${recipients.length} video notifications`);
      }
    } catch (waErr) {
      console.error('WhatsApp notification for new video failed:', waErr);
    }

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

    // Authorization - only creator, admin, developer, or assistant can upload
    if (video.createdBy.toString() !== req.user.id && !['admin', 'developer', 'assistant'].includes(req.user.role)) {
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
  } finally {
    // Clean up local uploaded file in all conditions to prevent leaks
    if (req.file && req.file.path) {
      const fs = require('fs');
      if (fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
          console.log(`🧹 Cleaned up local video file: ${req.file.path}`);
        } catch (err) {
          console.error('Failed to cleanup video file:', err.message);
        }
      }
    }
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
    if (video.createdBy.toString() !== req.user.id && !['admin', 'developer', 'assistant'].includes(req.user.role)) {
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
    if (video.createdBy.toString() !== req.user.id && !['admin', 'developer', 'assistant'].includes(req.user.role)) {
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
 * Body: { count, durationDays, expiryDays, prefix }
 */
exports.createAccessCodes = async (req, res) => {
  try {
    const { count = 10, durationDays, expiryDays, prefix = 'VID-' } = req.body;

    const numCount = parseInt(count, 10);
    if (isNaN(numCount) || numCount <= 0 || numCount > 1000) {
      return res.status(400).json({ success: false, message: 'Count must be between 1 and 1000' });
    }

    const video = await Video.findById(req.params.videoId);
    if (!video) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }

    const { v4: uuidv4 } = require('uuid');
    const generationBatchId = uuidv4();
    const codesToInsert = [];

    const calculatedExpiry = expiryDays 
      ? new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000) 
      : null;

    for (let i = 0; i < numCount; i++) {
      const randomPart = Math.random().toString(36).substring(2, 10).toUpperCase();
      const codeStr = `${prefix}${randomPart}`;
      
      codesToInsert.push({
        code: codeStr,
        type: 'video',
        role: 'student',
        maxUsers: 1, // standard for video codes
        expiryDate: calculatedExpiry,
        durationDays: durationDays || null,
        linkedResource: video._id,
        generationBatchId,
        createdBy: req.user.id
      });
    }

    const createdCodes = await AccessCode.insertMany(codesToInsert);

    res.status(201).json({
      success: true,
      message: 'Access codes created',
      data: {
        codesCreated: createdCodes.length,
        generationBatchId,
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
 * Get video access codes (Admin/Developer/Assistant only)
 * GET /api/videos/:videoId/access-codes
 * Query: page, limit, batchId
 */
exports.getAccessCodes = async (req, res) => {
  try {
    // Authorization
    if (!['admin', 'developer', 'assistant'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const { page = 1, limit = 50, batchId } = req.query;
    const filter = {
      linkedResource: req.params.videoId,
      type: 'video'
    };
    
    if (batchId) {
      filter.generationBatchId = batchId;
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const codes = await AccessCode.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .lean();

    const total = await AccessCode.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: codes,
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        pages: Math.ceil(total / parseInt(limit, 10))
      }
    });
  } catch (error) {
    console.error('Get access codes error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch access codes' });
  }
};

/**
 * Mark a video access code as sold
 * PATCH /api/videos/access-codes/:codeId/sell
 */
exports.sellCode = async (req, res) => {
  try {
    if (!['admin', 'developer', 'assistant'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    const code = await AccessCode.findById(req.params.codeId);
    if (!code || code.type !== 'video') return res.status(404).json({ success: false, message: 'Code not found' });
    if (code.isSold) return res.status(400).json({ success: false, message: 'Code is already marked as sold' });

    code.isSold = true;
    code.soldAt = new Date();
    await code.save();

    res.json({ success: true, data: code });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Mark a batch of video codes as saved to PDF
 * PATCH /api/videos/batch/:batchId/mark-pdf
 */
exports.markBatchPdf = async (req, res) => {
  try {
    if (!['admin', 'developer', 'assistant'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }
    const { batchId } = req.params;
    if (!batchId) return res.status(400).json({ success: false, message: 'Batch ID is required' });

    const result = await AccessCode.updateMany(
      { generationBatchId: batchId, type: 'video' },
      { $set: { savedInPdf: true } }
    );

    res.json({ success: true, modifiedCount: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Edit a specific access code
 * PUT /api/videos/access-codes/:codeId
 */
exports.updateAccessCode = async (req, res) => {
  try {
    // Authorization
    if (!['admin', 'developer', 'assistant'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to edit access codes'
      });
    }

    const { maxUsers, durationDays, expiryDays, active, code } = req.body;
    
    const updateData = {};
    if (typeof maxUsers !== 'undefined') updateData.maxUsers = maxUsers;
    if (typeof durationDays !== 'undefined') updateData.durationDays = durationDays;
    if (typeof active !== 'undefined') updateData.active = active;
    if (typeof code !== 'undefined') updateData.code = code;
    if (typeof expiryDays !== 'undefined') {
      updateData.expiryDate = expiryDays ? new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000) : null;
    }

    const updatedCode = await AccessCode.findByIdAndUpdate(
      req.params.codeId,
      { $set: updateData },
      { new: true }
    );

    if (!updatedCode) {
      return res.status(404).json({ success: false, message: 'Access code not found' });
    }

    res.status(200).json({
      success: true,
      message: 'Access code updated',
      data: updatedCode
    });
  } catch (error) {
    console.error('Update access code error:', error);
    res.status(500).json({ success: false, message: 'Failed to update access code' });
  }
};

/**
 * Unlock a specific video using an access code
 * POST /api/videos/unlock (or /api/videos/:videoId/unlock)
 */
exports.unlockVideo = async (req, res) => {
  try {
    const { code } = req.body;
    let { videoId } = req.params;

    if (!code) {
      return res.status(400).json({ success: false, message: 'Access code is required' });
    }

    // Find access code (exact match, type video)
    const accessCode = await AccessCode.findOne({
      code: code,
      type: 'video',
      active: true
    });

    if (!accessCode) {
      return res.status(400).json({ success: false, message: '❌ رمز الوصول غير صحيح' });
    }
    
    // If videoId not provided in route, get it from code
    if (!videoId) {
      if (!accessCode.linkedResource) {
        return res.status(400).json({ success: false, message: '❌ رمز الوصول هذا غير مرتبط بفيديو محدد' });
      }
      videoId = accessCode.linkedResource.toString();
    }

    // 1. Find video
    const video = await Video.findById(videoId);
    if (!video) {
      return res.status(404).json({ success: false, message: 'Video not found' });
    }

    // Check if code is for this specific video
    if (accessCode.linkedResource && accessCode.linkedResource.toString() !== videoId) {
      return res.status(400).json({ success: false, message: '❌ هذا الرمز يخص فيديو آخر' });
    }

    // Check expiry
    if (accessCode.expiryDate && new Date() > accessCode.expiryDate) {
      return res.status(400).json({ success: false, message: '❌ رمز الوصول منتهي الصلاحية' });
    }

    // 🎯 Calculate expiry dynamically if durationDays is set
    let calculatedExpiry = accessCode.expiryDate;
    if (accessCode.durationDays) {
      calculatedExpiry = new Date(Date.now() + accessCode.durationDays * 24 * 60 * 60 * 1000);
    }

    // 3. ✅ Atomic check-and-add unlockedVideo first (prevents duplicate unlocks)
    const updatedUser = await User.findOneAndUpdate(
      {
        _id: req.user.id,
        'unlockedVideos.videoId': { $ne: videoId }
      },
      {
        $push: {
          unlockedVideos: {
            videoId,
            unlockedAt: new Date(),
            expiryDate: calculatedExpiry,
            codeId: accessCode._id
          }
        }
      },
      { new: true }
    );

    if (!updatedUser) {
      return res.status(200).json({ success: true, message: '❌ الفيديو مفعل بالفعل' });
    }

    // 4. ✅ Only increment counter after successful unlock
    if (accessCode.maxUsers) {
      const updatedCode = await AccessCode.findOneAndUpdate(
        { _id: accessCode._id, active: true, $expr: { $lt: ['$currentUsers', '$maxUsers'] } },
        { 
          $inc: { currentUsers: 1 },
          $set: { 
            usedByStudentId: req.user.id,
            usedByStudentName: `${req.user.firstName} ${req.user.lastName}`
          } 
        },
        { new: true }
      );
      if (!updatedCode) {
        // 🧹 Rollback — maxUsers exhausted, remove the unlock
        await User.findByIdAndUpdate(req.user.id, { $pull: { unlockedVideos: { videoId } } });
        return res.status(400).json({ success: false, message: '❌ تم استنفاد الحد الأقصى لاستخدام هذا الرمز' });
      }
    }

    res.status(200).json({
      success: true,
      message: 'تم تفعيل الفيديو بنجاح',
      data: {
        videoId: videoId,
        expiryDate: calculatedExpiry
      }
    });

  } catch (error) {
    console.error('Unlock video error:', error);
    res.status(500).json({
      success: false,
      message: 'حدث خطأ أثناء تفعيل الفيديو',
      error: error.message
    });
  }
};
