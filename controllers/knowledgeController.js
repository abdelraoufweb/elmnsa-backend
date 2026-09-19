// ==========================================
// KNOWLEDGE CONTROLLER
// ==========================================
// CRUD for AI knowledge files + context endpoint for voice AI

const KnowledgeFile = require('../models/KnowledgeFile');
const User = require('../models/User');

/**
 * Upload a new knowledge file
 */
exports.upload = async (req, res) => {
  try {
    const { title, content, fileType, grade, curriculum, lessonName, lessonsList, isGlobal } = req.body;
    const normalizedIsGlobal = isGlobal === true || isGlobal === 'true';
    const normalizedGrade = grade === '' || grade === undefined || grade === null ? null : Number(grade);
    const normalizedLessons = Array.isArray(lessonsList)
      ? lessonsList
      : String(lessonsList || '').split(',').map(item => item.trim()).filter(Boolean);

    if (!title || !content) {
      return res.status(400).json({ success: false, message: 'Title and content are required.' });
    }

    const file = new KnowledgeFile({
      title,
      content,
      fileType: fileType || 'txt',
      grade: normalizedIsGlobal ? null : normalizedGrade,
      curriculum: normalizedIsGlobal ? null : curriculum,
      lessonName: lessonName || '',
      lessonsList: normalizedLessons,
      isGlobal: normalizedIsGlobal,
      uploadedBy: req.user._id
    });

    await file.save();

    res.status(201).json({ success: true, message: 'Knowledge file uploaded.', data: file });
  } catch (error) {
    console.error('❌ [Knowledge] Upload error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to upload knowledge file.', error: error.message });
  }
};

/**
 * List all knowledge files (for admin panel)
 */
exports.list = async (req, res) => {
  try {
    const files = await KnowledgeFile.find({ active: true })
      .select('-content')
      .sort({ createdAt: -1 })
      .populate('uploadedBy', 'firstName lastName');

    res.status(200).json({ success: true, data: files });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to list knowledge files.', error: error.message });
  }
};

/**
 * Get a single knowledge file (full content)
 */
exports.getOne = async (req, res) => {
  try {
    const file = await KnowledgeFile.findById(req.params.id);
    if (!file) return res.status(404).json({ success: false, message: 'File not found.' });
    res.status(200).json({ success: true, data: file });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get file.', error: error.message });
  }
};

/**
 * Update a knowledge file
 */
exports.update = async (req, res) => {
  try {
    const { title, content, fileType, grade, curriculum, lessonName, lessonsList, isGlobal } = req.body;
    const normalizedIsGlobal = isGlobal === true || isGlobal === 'true';
    const normalizedGrade = grade === '' || grade === undefined || grade === null ? null : Number(grade);
    const file = await KnowledgeFile.findById(req.params.id);
    if (!file) return res.status(404).json({ success: false, message: 'File not found.' });

    if (title) file.title = title;
    if (content) file.content = content;
    if (fileType) file.fileType = fileType;
    file.isGlobal = normalizedIsGlobal;
    file.grade = normalizedIsGlobal ? null : (normalizedGrade || file.grade);
    file.curriculum = normalizedIsGlobal ? null : (curriculum || file.curriculum);
    if (lessonName !== undefined) file.lessonName = lessonName;
    if (lessonsList) {
      file.lessonsList = Array.isArray(lessonsList)
        ? lessonsList
        : String(lessonsList).split(',').map(item => item.trim()).filter(Boolean);
    }

    await file.save();

    res.status(200).json({ success: true, message: 'Knowledge file updated.', data: file });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update file.', error: error.message });
  }
};

/**
 * Delete a knowledge file (soft delete)
 */
exports.remove = async (req, res) => {
  try {
    const file = await KnowledgeFile.findById(req.params.id);
    if (!file) return res.status(404).json({ success: false, message: 'File not found.' });
    
    file.active = false;
    await file.save();

    res.status(200).json({ success: true, message: 'Knowledge file deleted.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete file.', error: error.message });
  }
};

/**
 * Get AI context for a specific student
 * Returns: global skills + grade/curriculum-specific sheets
 */
exports.getAIContext = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    // Fetch global skills
    const globalFiles = await KnowledgeFile.find({ isGlobal: true, active: true }).select('title content lessonName');

    // Fetch grade/curriculum-specific files
    let specificFiles = [];
    if (user.grade && user.curriculum) {
      specificFiles = await KnowledgeFile.find({
        grade: user.grade,
        curriculum: user.curriculum,
        isGlobal: false,
        active: true
      }).select('title content lessonName lessonsList');
    }

    // Combine into a single context string
    let contextParts = [];

    if (globalFiles.length) {
      contextParts.push('=== GLOBAL MATH SKILLS ===');
      globalFiles.forEach(f => {
        contextParts.push(`--- ${f.title} ---\n${f.content}`);
      });
    }

    if (specificFiles.length) {
      contextParts.push(`\n=== GRADE ${user.grade} (${(user.curriculum || '').toUpperCase()}) LESSONS ===`);
      specificFiles.forEach(f => {
        const lessons = f.lessonsList && f.lessonsList.length ? `\nAvailable lessons: ${f.lessonsList.join(', ')}` : '';
        contextParts.push(`--- ${f.title}${f.lessonName ? ': ' + f.lessonName : ''} ---${lessons}\n${f.content}`);
      });
    }

    res.status(200).json({
      success: true,
      data: {
        context: contextParts.join('\n\n'),
        studentName: user.firstName,
        studentGrade: user.grade,
        studentCurriculum: user.curriculum,
        aiNotes: user.aiNotes || [],
        completedLessons: user.aiCompletedLessons || []
      }
    });
  } catch (error) {
    console.error('❌ [Knowledge] getAIContext error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to fetch AI context.', error: error.message });
  }
};

/**
 * Update student AI notes (called by the AI via function calling)
 */
exports.updateStudentNotes = async (req, res) => {
  try {
    const { studentId, action, note, lesson } = req.body;
    const targetId = studentId || req.user._id;
    const user = await User.findById(targetId);
    if (!user) return res.status(404).json({ success: false, message: 'Student not found.' });

    if (action === 'add_note' && note) {
      if (!user.aiNotes) user.aiNotes = [];
      user.aiNotes.push(note);
    } else if (action === 'remove_note' && note) {
      user.aiNotes = (user.aiNotes || []).filter(n => n !== note);
    } else if (action === 'complete_lesson' && lesson) {
      if (!user.aiCompletedLessons) user.aiCompletedLessons = [];
      if (!user.aiCompletedLessons.includes(lesson)) {
        user.aiCompletedLessons.push(lesson);
      }
      // Remove any related notes
      user.aiNotes = (user.aiNotes || []).filter(n => !n.toLowerCase().includes(lesson.toLowerCase()));
    } else if (action === 'clear_notes') {
      user.aiNotes = [];
    }

    await user.save();

    res.status(200).json({ success: true, message: 'Student notes updated.', data: { aiNotes: user.aiNotes, completedLessons: user.aiCompletedLessons } });
  } catch (error) {
    console.error('❌ [Knowledge] updateStudentNotes error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to update notes.', error: error.message });
  }
};

/**
 * Get Voice AI keys (Gemini + ElevenLabs) for verified users only
 * Returns keys securely so frontend doesn't hardcode them
 */
exports.getVoiceToken = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    // Only students need access check; admin/dev/assistant always have access
    if (user.role === 'student') {
      if (!user.aiAccessUnlocked || !user.aiAccessCode) {
        return res.status(403).json({ success: false, message: 'AI access required.' });
      }

      const AccessCode = require('../models/AccessCode');
      const accessCode = await AccessCode.findOne({ code: user.aiAccessCode, type: 'ai', active: true });
      if (!accessCode || (accessCode.expiryDate && accessCode.expiryDate < new Date())) {
        await User.findByIdAndUpdate(user._id, { aiAccessUnlocked: false });
        return res.status(403).json({ success: false, message: 'AI access has expired or was disabled.' });
      }
    }

    // Return ALL available Gemini keys so frontend can rotate on failure
    const geminiKeys = (process.env.GEMINI_VOICE_KEYS || process.env.GEMINI_API_KEY || '').split(',').map(k => k.trim()).filter(Boolean);
    
    // Return ElevenLabs keys
    const elevenLabsKeys = (process.env.ELEVENLABS_API_KEY || '').split(',').map(k => k.trim()).filter(Boolean);
    const elevenLabsVoiceId = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJcg';

    // Return Cartesia keys
    const cartesiaApiKey = process.env.CARTESIA_API_KEY || 'sk_car_MpzG3BsG8UphFHxxZWuy1j'; // moved from frontend for security

    if (!geminiKeys.length) {
      return res.status(503).json({ success: false, message: 'Voice AI not configured.' });
    }

    res.status(200).json({
      success: true,
      data: {
        tokens: geminiKeys,
        elevenLabs: elevenLabsKeys,
        elevenLabsVoiceId,
        cartesiaApiKey
      }
    });
  } catch (error) {
    console.error('❌ [Voice] Token error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to get voice token.', error: error.message });
  }
};
