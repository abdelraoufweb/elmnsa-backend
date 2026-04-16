// ==========================================
// AI CONTROLLER
// ==========================================

const axios = require('axios');
const AccessCode = require('../models/AccessCode');
const User = require('../models/User');

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
        console.log(`🔑 [AI] Access code ${trimmedCode} redeemed via chat by user ${userId}.`);
        
        // Unlock access for this user in DB
        await User.findByIdAndUpdate(userId, { 
          aiAccessUnlocked: true, 
          aiAccessCode: trimmedCode 
        });

        // Update usage tracking
        potentialCode.currentUsers = (potentialCode.currentUsers || 0) + 1;
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
    const systemPrompt = "You are a helpful Mathematics Assistant. You solve algebra, geometry, calculus, and other math problems step-by-step.";

    console.log(`🤖 [AI] Request from user ${req.user?._id || 'anonymous'}`);

    // 2️⃣ TRY GROQ (PRIMARY)
    try {
      if (process.env.GROQ_API_KEY) {
        console.log('📡 [AI] Attempting Groq...');
        const groqResult = await callGroq(message, history, systemPrompt);
        return res.status(200).json({
          success: true,
          data: { response: groqResult, provider: 'groq', timestamp: new Date() }
        });
      }
    } catch (groqErr) {
      const isQuotaError = groqErr.response?.status === 429 || groqErr.message.includes('quota') || groqErr.message.includes('limit');
      console.warn(`⚠️ [AI] Groq failed${isQuotaError ? ' (Quota Reached)' : ''}:`, groqErr.message);
      if (groqErr.response) {
        console.warn('📡 [AI] Groq Error Data:', JSON.stringify(groqErr.response.data, null, 2));
      }

      if (!isQuotaError && !process.env.GEMINI_API_KEY) {
        throw groqErr; // If not quota and no fallback, throw it
      }
      // If quota reached or other error, continue to Gemini...
    }

    // 3️⃣ TRY GEMINI (FALLBACK)
    if (process.env.GEMINI_API_KEY) {
      try {
        console.log('📡 [AI] Attempting Gemini Fallback...');
        const geminiResult = await callGemini(message, history, systemPrompt);
        return res.status(200).json({
          success: true,
          data: { response: geminiResult, provider: 'gemini', timestamp: new Date() }
        });
      } catch (geminiErr) {
        console.error('❌ [AI] Gemini Fallback also failed:', geminiErr.message);
        if (geminiErr.response) {
            console.error('📡 [AI] Gemini Error Data:', JSON.stringify(geminiErr.response.data, null, 2));
        }
        throw geminiErr;
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
    const { duration, code: customCode, maxUses } = req.body;
    
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
      expiryDate: expiresAt // 🎯 MATCH: Use expiryDate in model
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

    // ✅ Check max users limit
    if (accessCode.maxUsers && accessCode.currentUsers >= accessCode.maxUsers) {
      return res.status(403).json({
        success: false,
        message: 'Access code usage limit reached'
      });
    }

    // ✅ Track usage
    if (!accessCode.usageByUser) {
      accessCode.usageByUser = new Map();
    }
    const userId = req.user._id.toString();
    const existingUsage = accessCode.usageByUser.get(userId);
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
      aiAccessCode: code.trim()
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
