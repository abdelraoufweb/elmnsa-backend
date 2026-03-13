// ==========================================
// AI CONTROLLER
// ==========================================

const axios = require('axios');
const AccessCode = require('../models/AccessCode');

/**
 * Get AI response using Groq API
 */
/**
 * Get AI response with automatic fallback (Groq -> Gemini)
 */
exports.getResponse = async (req, res) => {
  try {
    const { message, historyArr = [], accessCode } = req.body;

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
  const model = process.env.GROQ_MODEL || 'mixtral-8x7b-32768';

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
  // Gemini 1.5 Flash is fast and free for most uses
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

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
    const { duration } = req.body;

    // Generate random 6-character code
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    let expiresAt = null;
    if (duration) {
      expiresAt = new Date(Date.now() + duration * 60 * 1000);
    }

    const accessCode = new AccessCode({
      code,
      createdBy: req.user._id,
      expiresAt
    });

    await accessCode.save();

    res.status(201).json({
      success: true,
      message: 'Access code generated successfully',
      data: {
        code,
        expiresAt
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
 * Verify access code
 */
exports.verifyAccessCode = async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Access code is required'
      });
    }

    const accessCode = await AccessCode.findOne({ code });

    if (!accessCode) {
      return res.status(404).json({
        success: false,
        message: 'Invalid access code'
      });
    }

    if (accessCode.expiresAt && accessCode.expiresAt < new Date()) {
      return res.status(403).json({
        success: false,
        message: 'Access code has expired'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Access code is valid',
      data: {
        isValid: true,
        expiresAt: accessCode.expiresAt
      }
    });
  } catch (error) {
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
