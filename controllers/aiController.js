// ==========================================
// AI CONTROLLER
// ==========================================

const axios = require('axios');
const AccessCode = require('../models/AccessCode');
const User = require('../models/User');
const KnowledgeFile = require('../models/KnowledgeFile');
// Built-in https for ElevenLabs streaming
const https = require('https');

/**
 * Get AI response using Groq API
 */
/**
 * Get AI response with automatic fallback (Groq -> Gemini)
 */
exports.getResponse = async (req, res) => {
  try {
    const { message, historyArr = [] } = req.body;
    const userId = req.user._id;

    // 🔑 [ACCESS CODE REDEMPTION VIA CHAT]: Check if user is sending a new code to unlock access
    if (message && message.length >= 4 && message.length <= 20) {
      const trimmedCode = message.trim();
      // Look for a valid AI code matching the message
      const potentialCode = await AccessCode.findOne({ code: trimmedCode, type: 'ai', active: true });
      const now = new Date();
      
      if (potentialCode && (!potentialCode.expiryDate || potentialCode.expiryDate > now)) {
        const existingUsage = potentialCode.usageByUser?.get(userId.toString());
        if (!existingUsage && potentialCode.maxUsers && potentialCode.currentUsers >= potentialCode.maxUsers) {
          return res.status(403).json({
            success: false,
            message: 'Access code usage limit reached'
          });
        }

        console.log(`🔑 [AI] Access code ${trimmedCode} redeemed via chat by user ${userId}.`);
        
        // Unlock access for this user in DB
        await User.findByIdAndUpdate(userId, { 
          aiAccessUnlocked: true, 
          aiAccessCode: trimmedCode 
        });

        // Update usage tracking without double-counting the same student
        if (!potentialCode.usageByUser) potentialCode.usageByUser = new Map();
        if (!existingUsage) {
          potentialCode.usageByUser.set(userId.toString(), { views: 1, unlockedAt: new Date() });
          potentialCode.currentUsers = (potentialCode.currentUsers || 0) + 1;
        } else {
          existingUsage.views = (existingUsage.views || 0) + 1;
          potentialCode.usageByUser.set(userId.toString(), existingUsage);
        }
        await potentialCode.save();

        return res.status(200).json({
          success: true,
          data: { 
            response: `✅ **تم تفعيل اشتراك الـ AI بنجاح!** 🎉\n\nكود الاشتراك: \`${trimmedCode}\` تم قبوله. يمكنك الآن البدء في طرح أسئلتك وسأقوم بمساعدتك فوراً.`, 
            provider: 'system', 
            timestamp: new Date() 
          }
        });
      }
    }

    // 🔒 [REVOCATION FIX]: Verify AI Access is still valid
    if (req.user.role === 'student') {
      const user = await User.findById(userId);
      if (!user.aiAccessUnlocked || !user.aiAccessCode) {
        return res.status(403).json({ 
          success: false, 
          message: 'AI access is locked. Please enter a valid access code by typing it here in the chat.' 
        });
      }

      const accessCode = await AccessCode.findOne({ code: user.aiAccessCode, type: 'ai', active: true });
      const now = new Date();
      
      if (!accessCode || (accessCode.expiryDate && accessCode.expiryDate < now)) {
        console.warn(`🔒 [AI] Revoking access for user ${userId} - Code ${user.aiAccessCode} is invalid/expired/disabled.`);
        
        // Revoke in DB
        await User.findByIdAndUpdate(userId, { aiAccessUnlocked: false });
        
        return res.status(403).json({ 
          success: false, 
          message: 'Your AI access code has been disabled, deleted, or expired. Please type a NEW access code here to continue.' 
        });
      }
    }

    if (!message) {
      return res.status(400).json({ success: false, message: 'Message is required' });
    }

    // 1️⃣ PREPARE HISTORY
    const history = Array.isArray(historyArr) ? historyArr : [];
    const systemPrompt = await buildSystemPrompt(req.user);

    console.log(`🤖 [AI] Request from user ${req.user?._id || 'anonymous'}`);

    // 2️⃣ TRY GEMINI (PRIMARY)
    try {
      if (process.env.GEMINI_API_KEY) {
        console.log('📡 [AI] Attempting Gemini (Primary)...');
        const geminiResult = await callGemini(message, history, systemPrompt);
        return res.status(200).json({
          success: true,
          data: { response: geminiResult, provider: 'gemini', timestamp: new Date() }
        });
      }
    } catch (geminiErr) {
      const isQuotaError = geminiErr.response?.status === 429 || geminiErr.message.includes('quota') || geminiErr.message.includes('limit');
      console.warn(`⚠️ [AI] Gemini failed${isQuotaError ? ' (Quota Reached)' : ''}:`, geminiErr.message);
      if (geminiErr.response) {
        console.warn('📡 [AI] Gemini Error Data:', JSON.stringify(geminiErr.response.data, null, 2));
      }

      if (!isQuotaError && !process.env.GROQ_API_KEY) {
        throw geminiErr;
      }
    }

    // 3️⃣ TRY GROQ (FALLBACK)
    if (process.env.GROQ_API_KEY) {
      try {
        console.log('📡 [AI] Attempting Groq Fallback...');
        const groqResult = await callGroq(message, history, systemPrompt);
        return res.status(200).json({
          success: true,
          data: { response: groqResult, provider: 'groq', timestamp: new Date() }
        });
      } catch (groqErr) {
        console.error('❌ [AI] Groq Fallback also failed:', groqErr.message);
        if (groqErr.response) {
            console.error('📡 [AI] Groq Error Data:', JSON.stringify(groqErr.response.data, null, 2));
        }
        throw groqErr;
      }
    }

    throw new Error('All AI providers failed or were not configured.');

  } catch (error) {
    console.error('❌ AI Final Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'AI Service currently unavailable',
      error: error.message
    });
  }
};

/**
 * Groq API Helper
 */
async function callGroq(message, history, systemPrompt) {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

  const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
    model: model,
    messages: [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: message }
    ],
    temperature: 0.3,
    max_tokens: 2048
  }, {
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    timeout: parseInt(process.env.GROQ_TIMEOUT_MS || '10000', 10)
  });

  const content = response.data.choices?.[0]?.message?.content;
  if (!content) {
    // Throw so callers can fallback to Gemini instead of silently returning a string
    throw new Error('Empty response from Groq');
  }

  return content;
}

/**
 * Gemini API Helper (Google AI)
 */
async function callGemini(message, history, systemPrompt) {
  const apiKey = process.env.GEMINI_API_KEY;
  // Gemini 2.0 Flash is fast and modern
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  // Convert histories to Gemini format
  const contents = history.map(h => ({
    role: h.role === 'user' ? 'user' : 'model',
    parts: [{ text: h.content }]
  }));

  // Add system prompt and current message
  contents.push({ role: 'user', parts: [{ text: systemPrompt + "\n\nUser Question: " + message }] });

  const response = await axios.post(url, {
    contents: contents,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 2048
    }
  }, {
    headers: { 'Content-Type': 'application/json' },
    timeout: parseInt(process.env.GEMINI_TIMEOUT_MS || '15000', 10)
  });

  if (response.data?.candidates?.[0]?.content?.parts?.[0]?.text) {
    return response.data.candidates[0].content.parts[0].text;
  }

  throw new Error('Gemini returned an empty response or unexpected format');
}

  /**
 * Generate access code
 */
exports.generateAccessCode = async (req, res) => {
  try {
    const { duration, code: customCode, maxUses, aiPermissions } = req.body;
    
    // Allow custom code or generate random 6-character code
    const code = customCode || Math.random().toString(36).substring(2, 8).toUpperCase();

    let expiresAt = null;
    if (duration) {
      expiresAt = new Date(Date.now() + Number(duration) * 60 * 1000);
    }

    const accessCode = new AccessCode({
      code,
      type: 'ai',        // 🎯 REQUIRED: Identification for AI-specific codes
      role: 'student',   // 🎯 REQUIRED: Target role for redeeming
      createdBy: req.user._id,
      maxUsers: maxUses ? Number(maxUses) : undefined,
      expiryDate: expiresAt, // 🎯 MATCH: Use expiryDate in model
      aiPermissions: aiPermissions || 'both'
    });

    await accessCode.save();

    res.status(201).json({
      success: true,
      message: 'Access code generated successfully',
      data: {
        code,
        expiryDate: expiresAt
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error generating access code',
      error: error.message
    });
  }
};

/**
 * Verify access code (AI-specific)
 */
exports.verifyAccessCode = async (req, res) => {
  try {
    const { code } = req.body;
    const User = require('../models/User');

    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Access code is required'
      });
    }

    // ✅ Filter by type='ai' and active=true
    const accessCode = await AccessCode.findOne({ 
      code: code.trim(),
      type: 'ai',
      active: true
    });

    if (!accessCode) {
      return res.status(404).json({
        success: false,
        message: 'Invalid access code'
      });
    }

    if (accessCode.expiryDate && accessCode.expiryDate < new Date()) {
      return res.status(403).json({
        success: false,
        message: 'Access code has expired'
      });
    }

    // ✅ Track usage
    if (!accessCode.usageByUser) {
      accessCode.usageByUser = new Map();
    }
    const userId = req.user._id.toString();
    const existingUsage = accessCode.usageByUser.get(userId);
    if (!existingUsage && accessCode.maxUsers && accessCode.currentUsers >= accessCode.maxUsers) {
      return res.status(403).json({
        success: false,
        message: 'Access code usage limit reached'
      });
    }

    if (!existingUsage) {
      accessCode.usageByUser.set(userId, { views: 1, unlockedAt: new Date() });
      accessCode.currentUsers = (accessCode.currentUsers || 0) + 1;
    } else {
      existingUsage.views = (existingUsage.views || 0) + 1;
      accessCode.usageByUser.set(userId, existingUsage);
    }
    await accessCode.save();

    // ✅ Update user's aiAccessUnlocked in database
    await User.findByIdAndUpdate(req.user._id, {
      aiAccessUnlocked: true,
      aiAccessCode: code.trim(),
      aiPermissions: accessCode.aiPermissions || 'both'
    });

    console.log(`✅ [AI] Access code verified for user ${req.user._id}`);

    res.status(200).json({
      success: true,
      message: 'AI access unlocked',
      data: {
        isValid: true,
        expiresAt: accessCode.expiryDate
      }
    });
  } catch (error) {
    console.error('❌ [AI] Access code error:', error);
    res.status(500).json({
      success: false,
      message: 'Error verifying access code',
      error: error.message
    });
  }
};

/**
 * Get AI access status for current user
 */
exports.getAccessStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Students need active access code
    if (user.role === 'student') {
      if (!user.aiAccessUnlocked || !user.aiAccessCode) {
        return res.status(200).json({ success: true, data: { unlocked: false } });
      }

      const accessCode = await AccessCode.findOne({ code: user.aiAccessCode, type: 'ai', active: true });
      const now = new Date();

      if (!accessCode || (accessCode.expiryDate && accessCode.expiryDate < now)) {
        // Auto-revoke expired access
        await User.findByIdAndUpdate(user._id, { aiAccessUnlocked: false, aiAccessCode: null });
        console.log(`🔒 [AI] Auto-revoked expired access for user ${user._id}`);
        return res.status(200).json({ success: true, data: { unlocked: false } });
      }

      return res.status(200).json({
        success: true,
        data: {
          unlocked: true,
          code: user.aiAccessCode,
          expiresAt: accessCode.expiryDate || null,
          remainingDays: accessCode.expiryDate
            ? Math.ceil((accessCode.expiryDate - now) / (1000 * 60 * 60 * 24))
            : null
        }
      });
    }

    // Non-students (admin, dev, assistant) always have access
    return res.status(200).json({ success: true, data: { unlocked: true } });

  } catch (error) {
    console.error('❌ [AI] Access status error:', error.message);
    res.status(500).json({ success: false, message: 'Error checking access status' });
  }
};

/**
 * Revoke AI access for a student (admin/developer only)
 */
exports.revokeAccess = async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: 'userId required' });

    const student = await User.findById(userId);
    if (!student || student.role !== 'student') {
      return res.status(404).json({ success: false, message: 'Student not found' });
    }

    const oldCode = student.aiAccessCode;
    student.aiAccessUnlocked = false;
    student.aiAccessCode = null;
    await student.save();

    console.log(`🔒 [AI] Developer revoked AI access for user ${userId} (code: ${oldCode})`);

    res.status(200).json({ success: true, message: 'AI access revoked for student' });
  } catch (error) {
    console.error('❌ [AI] Revoke error:', error.message);
    res.status(500).json({ success: false, message: 'Error revoking access' });
  }
};

/**
 * Get AI conversation history
 */
exports.getConversationHistory = async (req, res) => {
  try {
    // Placeholder for conversation history
    const history = {
      userId: req.user._id,
      messages: [],
      totalMessages: 0
    };

    res.status(200).json({
      success: true,
      data: history
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching conversation history',
      error: error.message
    });
  }
};

/**
 * Clear conversation
 */
exports.clearConversation = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      message: 'Conversation cleared successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error clearing conversation',
      error: error.message
    });
  }
};

async function buildSystemPrompt(authUser) {
  const user = await User.findById(authUser._id).lean();
  const userName = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Student';

  const globalFiles = await KnowledgeFile.find({ isGlobal: true, active: true })
    .select('title content lessonName lessonsList')
    .lean();

  let specificFiles = [];
  if (user?.grade && user?.curriculum) {
    specificFiles = await KnowledgeFile.find({
      grade: Number(user.grade),
      curriculum: user.curriculum,
      isGlobal: false,
      active: true
    }).select('title content lessonName lessonsList').lean();
  }

  const contextParts = [];
  if (globalFiles.length) {
    contextParts.push('=== GLOBAL SKILLS / TEACHING RULES ===');
    globalFiles.forEach(file => {
      contextParts.push(formatKnowledgeFile(file));
    });
  }

  if (specificFiles.length) {
    contextParts.push(`=== STUDENT COURSE MATERIAL: GRADE ${user.grade} ${String(user.curriculum).toUpperCase()} ===`);
    specificFiles.forEach(file => {
      contextParts.push(formatKnowledgeFile(file));
    });
  }

  const notes = Array.isArray(user?.aiNotes) && user.aiNotes.length
    ? user.aiNotes.map(note => `- ${note}`).join('\n')
    : 'No saved notes yet.';

  const completed = Array.isArray(user?.aiCompletedLessons) && user.aiCompletedLessons.length
    ? user.aiCompletedLessons.join(', ')
    : 'None yet.';

  return `You are "Raouf" (رؤوف), also called "Roufi" (روفي), an expert Math Teacher on the Abdelraouf platform.
Speak in the same language the student uses, Arabic or English.
Student: ${userName}
Grade: ${user?.grade || 'unknown'}
Curriculum: ${user?.curriculum || 'unknown'}

Rules:
- Only answer Mathematics and study questions related to Mathematics.
- Use the uploaded teaching knowledge below as the primary source whenever it is relevant.
- If the uploaded knowledge conflicts with your general knowledge, follow the uploaded knowledge.
- Explain step by step, ask the student to use pen and paper for multi-step problems, and keep the tone friendly.
- Do not invent lessons from the knowledge base. If a needed file is missing, say what is missing and continue with general math help.

Student Notes:
${notes}

Completed Lessons:
${completed}

Uploaded Knowledge:
${contextParts.join('\n\n') || 'No uploaded knowledge files are available for this student yet.'}`;
}

function formatKnowledgeFile(file) {
  const lesson = file.lessonName ? ` | Lesson: ${file.lessonName}` : '';
  const lessons = Array.isArray(file.lessonsList) && file.lessonsList.length
    ? `\nAvailable lessons: ${file.lessonsList.join(', ')}`
    : '';
  return `--- ${file.title}${lesson} ---${lessons}\n${file.content}`;
}

// ==========================================
// VOICE CHAT ENDPOINT (Gemini + ElevenLabs)
// ==========================================

// Key rotation state
let _elevenLabsKeyIdx = 0;
const _elevenLabsKeys = [
  process.env.ELEVENLABS_API_KEY,
].filter(Boolean);

async function callElevenLabsTTS(text) {
  const keys = _elevenLabsKeys.length ? _elevenLabsKeys : ['sk_00e8ba471cba78be96e87f4eb167ec7a71d55f50d9e44ee2'];
  const voiceId = process.env.ELEVENLABS_VOICE_ID || 'pNInz6obpgDQGcFmaJcg';
  
  for (let attempt = 0; attempt < keys.length; attempt++) {
    const key = keys[_elevenLabsKeyIdx % keys.length];
    try {
      const res = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
        {
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 }
        },
        {
          headers: { 'xi-api-key': key, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
          responseType: 'arraybuffer',
          timeout: 20000
        }
      );
      return res.data; // ArrayBuffer of mp3
    } catch (err) {
      const status = err.response?.status;
      console.warn(`⚠️ [ElevenLabs] Key ${_elevenLabsKeyIdx} failed (${status}), rotating...`);
      _elevenLabsKeyIdx = (_elevenLabsKeyIdx + 1) % keys.length;
      if (attempt === keys.length - 1) throw err;
    }
  }
}

/**
 * POST /api/ai/voice-chat
 * Body: { text: string, history: array }
 * Returns: audio/mpeg binary stream
 */
exports.voiceChat = async (req, res) => {
  try {
    const { text, history = [] } = req.body;
    if (!text) return res.status(400).json({ success: false, message: 'text is required' });

    // Build system prompt from the user's context
    const systemPrompt = await buildSystemPrompt(req.user);
    const voiceSystemPrompt = systemPrompt + '\n\nIMPORTANT: Keep your response concise and conversational (2-4 sentences max for voice). Do NOT use markdown, lists, or symbols.';

    // 1. Get text reply from Gemini (with Groq fallback)
    let replyText = '';
    try {
      replyText = await callGemini(text, history, voiceSystemPrompt);
      console.log(`✅ [VoiceChat] Gemini OK (${replyText.length} chars)`);
    } catch (geminiErr) {
      console.warn('⚠️ [VoiceChat] Gemini failed, trying Groq...', geminiErr.message);
      replyText = await callGroq(text, history, voiceSystemPrompt);
      console.log(`✅ [VoiceChat] Groq OK (${replyText.length} chars)`);
    }

    // 2. Convert text to audio with ElevenLabs
    const audioBuffer = await callElevenLabsTTS(replyText);

    // 3. Send audio + text back to client
    res.set({
      'Content-Type': 'audio/mpeg',
      'X-Voice-Text': Buffer.from(replyText.substring(0, 500)).toString('base64'), // first 500 chars for transcript
      'Content-Length': audioBuffer.byteLength
    });
    res.send(Buffer.from(audioBuffer));

  } catch (err) {
    console.error('❌ [VoiceChat] Error:', err.message);
    res.status(500).json({ success: false, message: 'Voice service error', error: err.message });
  }
};
