// ==========================================
// AI MESSAGE REPHRASING SERVICE
// ==========================================
// Uses multiple AI APIs in a fallback chain to rephrase
// WhatsApp messages so each recipient gets a unique version.
// This prevents WhatsApp's anti-spam detection from flagging
// identical bulk messages.
//
// Fallback chain:
//   1. DeepSeek (via API key)
//   2. OpenRouter (via sk-or-v1 key)
//   3. Groq (via gsk_ key - Llama 3.3 70B)
//   4. Google Gemini 1.5 Flash (via AIzaSy key)
//
// If ALL APIs fail, the original message is returned as-is.

const axios = require('axios');

// ==========================================
// API CONFIGURATIONS
// ==========================================

const AI_PROVIDERS = [
  // 1. Groq (Main Heavy Model)
  {
    name: 'Groq (Llama 3.3 70B)',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    apiKey: process.env.GROQ_REPHRASE_API_KEY || '',
    model: 'llama-3.3-70b-versatile',
    type: 'openai-compatible'
  },
  // 2. Groq (Allam Arabic Model - Fast & Specialized)
  {
    name: 'Groq (Allam Arabic)',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    apiKey: process.env.GROQ_REPHRASE_API_KEY || '',
    model: 'allam-2-7b',
    type: 'openai-compatible'
  },
  // 3. Groq (Llama 3.1 8B - Instant Backup)
  {
    name: 'Groq (Llama 8B)',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    apiKey: process.env.GROQ_REPHRASE_API_KEY || '',
    model: 'llama-3.1-8b-instant',
    type: 'openai-compatible'
  },
  // 4. OpenRouter Backup
  {
    name: 'OpenRouter Backup',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    apiKey: process.env.OPENROUTER_API_KEY || '',
    model: 'google/gemma-4-26b-a4b-it:free',
    type: 'openai-compatible',
    extraHeaders: {
      'HTTP-Referer': 'https://elraouf.netlify.app',
      'X-Title': 'ElRaouf Platform'
    }
  }
];

// Track which provider was last used for round-robin
let lastProviderIndex = -1;

// Simple in-memory cache to avoid rephrasing same message twice
const rephraseCache = new Map();
const CACHE_MAX_SIZE = 500;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

// ==========================================
// REPHRASE SYSTEM PROMPT
// ==========================================

const SYSTEM_PROMPT = `أنت مساعد ذكي لإعادة صياغة الرسائل. مهمتك هي أخذ رسالة واتساب وإعادة صياغتها بطريقة مختلفة تماماً مع الحفاظ على المعنى والمعلومات الأساسية.

القواعد:
1. غيّر ترتيب الجمل وطريقة التعبير لكن احتفظ بكل المعلومات (أسماء، تواريخ، أرقام، أوقات)
2. استخدم مرادفات عربية مختلفة في كل مرة
3. غيّر التحية والخاتمة بشكل عشوائي (مرحبا، أهلاً، السلام عليكم، يا هلا، الخ)
4. أضف إيموجي مختلفة عن الأصلية لكن بشكل طبيعي ومناسب
5. لا تضف روابط أو معلومات لم تكن في الرسالة الأصلية
6. اجعل الرسالة تبدو وكأنها مكتوبة يدوياً من شخص حقيقي
7. الرد يكون الرسالة المعدلة فقط بدون أي شرح أو مقدمة
8. حافظ على الأسلوب الودي والمهني
9. طول الرسالة يجب أن يكون قريب من الأصلية (لا تختصر كثيراً ولا تطوّل كثيراً)`;

// ==========================================
// CORE REPHRASE FUNCTION
// ==========================================

/**
 * Rephrase a message using the AI fallback chain
 * @param {string} originalMessage - The original message to rephrase
 * @param {Object} options - Options { recipientName, forceProvider }
 * @returns {Promise<string>} - The rephrased message (or original on failure)
 */
async function rephraseMessage(originalMessage, options = {}) {
  // Don't rephrase very short messages (greetings, single words)
  if (!originalMessage || originalMessage.length < 30) {
    return originalMessage;
  }

  // Generate a unique cache key per recipient to ensure different phrasings
  const cacheKey = `${originalMessage.substring(0, 50)}:${options.recipientName || 'default'}:${Date.now() % 100}`;

  // Check cache (with TTL)
  if (rephraseCache.has(cacheKey)) {
    const cached = rephraseCache.get(cacheKey);
    if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.rephrased;
    }
    rephraseCache.delete(cacheKey);
  }

  // Get available providers (ones with API keys set)
  const availableProviders = AI_PROVIDERS.filter(p => p.apiKey && p.apiKey.length > 5);

  if (availableProviders.length === 0) {
    console.warn('⚠️ [AI Rephrase] No AI providers configured. Using original message.');
    return originalMessage;
  }

  // Round-robin starting point
  lastProviderIndex = (lastProviderIndex + 1) % availableProviders.length;

  // Try each provider in order, starting from the round-robin position
  for (let attempt = 0; attempt < availableProviders.length; attempt++) {
    const providerIndex = (lastProviderIndex + attempt) % availableProviders.length;
    const provider = availableProviders[providerIndex];

    try {
      let rephrased;

      if (provider.type === 'gemini') {
        rephrased = await callGemini(provider, originalMessage, options);
      } else {
        rephrased = await callOpenAICompatible(provider, originalMessage, options);
      }

      // Validate the rephrased message
      if (rephrased && rephrased.length > 10 && rephrased !== originalMessage) {
        // Cache it
        if (rephraseCache.size >= CACHE_MAX_SIZE) {
          // Evict oldest entry
          const firstKey = rephraseCache.keys().next().value;
          rephraseCache.delete(firstKey);
        }
        rephraseCache.set(cacheKey, { rephrased, timestamp: Date.now() });

        console.log(`✅ [AI Rephrase] Message rephrased via ${provider.name}`);
        return rephrased;
      }
    } catch (error) {
      console.warn(`⚠️ [AI Rephrase] ${provider.name} failed: ${error.message}`);
      // Continue to next provider
    }
  }

  // All providers failed - return original
  console.warn('⚠️ [AI Rephrase] All providers failed. Using original message.');
  return originalMessage;
}

// ==========================================
// PROVIDER-SPECIFIC CALLERS
// ==========================================

/**
 * Call an OpenAI-compatible API (DeepSeek, OpenRouter, Groq)
 */
async function callOpenAICompatible(provider, message, options) {
  const userPrompt = options.recipientName
    ? `أعد صياغة هذه الرسالة المرسلة إلى "${options.recipientName}":\n\n${message}`
    : `أعد صياغة هذه الرسالة:\n\n${message}`;

  const headers = {
    'Authorization': `Bearer ${provider.apiKey}`,
    'Content-Type': 'application/json',
    ...(provider.extraHeaders || {})
  };

  const response = await axios.post(
    provider.url,
    {
      model: provider.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.9, // High creativity for variation
      max_tokens: 500,
      top_p: 0.95
    },
    {
      headers,
      timeout: 15000 // 15 second timeout
    }
  );

  const content = response.data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response');
  return content.trim();
}

/**
 * Call Google Gemini API
 */
async function callGemini(provider, message, options) {
  const userPrompt = options.recipientName
    ? `أعد صياغة هذه الرسالة المرسلة إلى "${options.recipientName}":\n\n${message}`
    : `أعد صياغة هذه الرسالة:\n\n${message}`;

  const response = await axios.post(
    `${provider.url}?key=${provider.apiKey}`,
    {
      contents: [
        {
          parts: [
            { text: `${SYSTEM_PROMPT}\n\n${userPrompt}` }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: 500,
        topP: 0.95
      }
    },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000
    }
  );

  const content = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error('Empty Gemini response');
  return content.trim();
}

// ==========================================
// BATCH REPHRASE (for efficiency)
// ==========================================

/**
 * Rephrase the same message for multiple recipients
 * Returns a Map of recipientId -> rephrasedMessage
 * @param {string} originalMessage - The template message
 * @param {Array} recipients - Array of { id, name }
 * @returns {Promise<Map<string, string>>} - Map of recipientId -> rephrased
 */
async function batchRephrase(originalMessage, recipients) {
  const results = new Map();

  for (const recipient of recipients) {
    try {
      const rephrased = await rephraseMessage(originalMessage, {
        recipientName: recipient.name
      });
      results.set(recipient.id, rephrased);

      // Small delay between API calls to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.warn(`⚠️ [AI Rephrase] Failed for ${recipient.name}, using original`);
      results.set(recipient.id, originalMessage);
    }
  }

  return results;
}

// ==========================================
// HEALTH CHECK
// ==========================================

/**
 * Check which AI providers are available
 */
function getProviderStatus() {
  return AI_PROVIDERS.map(p => ({
    name: p.name,
    configured: !!(p.apiKey && p.apiKey.length > 5),
    model: p.model
  }));
}

// ==========================================
// TEST INDIVIDUAL PROVIDER
// ==========================================

/**
 * Test a specific provider by name
 * @param {string} providerName - 'deepseek', 'openrouter', 'groq', or 'gemini'
 * @param {string} testMessage - Message to test with
 * @returns {Promise<string>} - The rephrased result
 */
async function testProvider(providerName, testMessage) {
  const provider = AI_PROVIDERS.find(p => p.name.toLowerCase() === providerName.toLowerCase());
  if (!provider) throw new Error(`Unknown provider: ${providerName}`);
  if (!provider.apiKey || provider.apiKey.length < 5) throw new Error(`${providerName} API key not configured`);

  if (provider.type === 'gemini') {
    return await callGemini(provider, testMessage, { recipientName: 'تيست' });
  } else {
    return await callOpenAICompatible(provider, testMessage, { recipientName: 'تيست' });
  }
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  rephraseMessage,
  batchRephrase,
  getProviderStatus,
  testProvider,
  AI_PROVIDERS
};
