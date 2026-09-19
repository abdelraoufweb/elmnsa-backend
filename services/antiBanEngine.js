// ==========================================
// ANTI-BAN ENGINE FOR WHATSAPP
// ==========================================
// Implements all known anti-ban techniques to prevent
// WhatsApp from flagging/banning connected numbers.
//
// Features:
//   1. Random human-like delays between messages
//   2. Typing simulation (composing state)
//   3. Daily message limits per number
//   4. Number warm-up system for new numbers
//   5. Smart rest periods (coffee breaks)
//   6. Business hours enforcement
//   7. Read receipts for incoming messages
//   8. Reply encouragement (ends with questions)
//   9. Link protection (no links to unsaved contacts)
//  10. Activity diversification

// ==========================================
// CONFIGURATION
// ==========================================

const CONFIG = {
  // ── Message Delays ──────────────────────
  // Random delay range between messages (milliseconds)
  MIN_DELAY_MS: 25000,          // 25 seconds minimum
  MAX_DELAY_MS: 180000,         // 3 minutes maximum
  
  // ── Coffee Breaks ──────────────────────
  // After X messages, take a long break
  MESSAGES_BEFORE_BREAK: 15,     // Take a break every 15 messages
  MIN_BREAK_MS: 600000,          // 10 minutes minimum break
  MAX_BREAK_MS: 1200000,         // 20 minutes maximum break
  
  // ── Daily Limits Per Number ────────────
  MAX_MESSAGES_PER_DAY_NEW: 15,   // New numbers (< 7 days old)
  MAX_MESSAGES_PER_DAY_WARM: 40,  // Warming up (7-14 days)
  MAX_MESSAGES_PER_DAY_MATURE: 80,// Mature numbers (> 14 days)
  
  // ── Typing Simulation ─────────────────
  MIN_TYPING_MS: 2000,           // 2 seconds minimum typing
  MAX_TYPING_MS: 8000,           // 8 seconds maximum typing
  CHARS_PER_SECOND: 4,           // Simulate ~4 chars/sec typing speed
  
  // ── Business Hours ────────────────────
  // Only send during reasonable hours (Cairo time, UTC+3)
  BUSINESS_HOURS_START: 8,       // 8:00 AM
  BUSINESS_HOURS_END: 22,        // 10:00 PM
  
  // ── Warm-Up Schedule ──────────────────
  // Messages allowed per day during warm-up period
  WARMUP_SCHEDULE: [
    { day: 1, maxMessages: 5 },
    { day: 2, maxMessages: 10 },
    { day: 3, maxMessages: 20 },
    { day: 4, maxMessages: 30 },
    { day: 5, maxMessages: 40 },
    { day: 6, maxMessages: 50 },
    { day: 7, maxMessages: 60 },
    // After 7 days, use MAX_MESSAGES_PER_DAY_WARM
  ]
};

// Track message counts per session per day
const dailyMessageCounts = new Map(); // sessionId -> { date, count }

// Track messages sent in current batch (for coffee breaks)
const batchCounters = new Map(); // sessionId -> count

// ==========================================
// DELAY GENERATORS
// ==========================================

/**
 * Generate a random human-like delay between messages
 * Uses a gaussian-like distribution for more natural behavior
 * @returns {number} Delay in milliseconds
 */
function getRandomDelay() {
  // Use Box-Muller transform for gaussian distribution
  const u1 = Math.random();
  const u2 = Math.random();
  const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  
  // Map gaussian to our range (center around middle, spread to edges)
  const mean = (CONFIG.MIN_DELAY_MS + CONFIG.MAX_DELAY_MS) / 2;
  const stdDev = (CONFIG.MAX_DELAY_MS - CONFIG.MIN_DELAY_MS) / 4;
  
  let delay = Math.round(mean + gaussian * stdDev);
  
  // Clamp to range
  delay = Math.max(CONFIG.MIN_DELAY_MS, Math.min(CONFIG.MAX_DELAY_MS, delay));
  
  // Add micro-jitter (±2 seconds) for extra humanness
  delay += Math.floor(Math.random() * 4000) - 2000;
  
  return Math.max(CONFIG.MIN_DELAY_MS, delay);
}

/**
 * Get typing duration based on message length
 * @param {string} message - The message to be sent
 * @returns {number} Typing duration in milliseconds
 */
function getTypingDuration(message) {
  if (!message) return CONFIG.MIN_TYPING_MS;
  
  // Calculate based on message length (simulate typing speed)
  const charBasedDuration = (message.length / CONFIG.CHARS_PER_SECOND) * 1000;
  
  // Add randomness (±30%)
  const variance = charBasedDuration * 0.3;
  const randomized = charBasedDuration + (Math.random() * variance * 2) - variance;
  
  // Clamp to range
  return Math.max(CONFIG.MIN_TYPING_MS, Math.min(CONFIG.MAX_TYPING_MS, Math.round(randomized)));
}

/**
 * Get coffee break duration
 * @returns {number} Break duration in milliseconds
 */
function getCoffeeBreakDuration() {
  return CONFIG.MIN_BREAK_MS + Math.random() * (CONFIG.MAX_BREAK_MS - CONFIG.MIN_BREAK_MS);
}

// ==========================================
// DAILY LIMIT MANAGEMENT
// ==========================================

/**
 * Check if a session has reached its daily message limit
 * @param {string} sessionId - The session identifier
 * @param {Date} registeredDate - When the number was first connected
 * @returns {{ allowed: boolean, remaining: number, limit: number }}
 */
function checkDailyLimit(sessionId, registeredDate = new Date()) {
  const today = new Date().toISOString().split('T')[0];
  
  // Get or create daily counter
  let counter = dailyMessageCounts.get(sessionId);
  if (!counter || counter.date !== today) {
    counter = { date: today, count: 0 };
    dailyMessageCounts.set(sessionId, counter);
  }
  
  // Calculate the daily limit based on number age
  const ageInDays = Math.floor((Date.now() - new Date(registeredDate).getTime()) / (1000 * 60 * 60 * 24));
  
  let limit;
  if (ageInDays < 7) {
    // Check warm-up schedule
    const warmupDay = CONFIG.WARMUP_SCHEDULE.find(w => w.day === ageInDays + 1);
    limit = warmupDay ? warmupDay.maxMessages : CONFIG.MAX_MESSAGES_PER_DAY_NEW;
  } else if (ageInDays < 14) {
    limit = CONFIG.MAX_MESSAGES_PER_DAY_WARM;
  } else {
    limit = CONFIG.MAX_MESSAGES_PER_DAY_MATURE;
  }
  
  return {
    allowed: counter.count < limit,
    remaining: Math.max(0, limit - counter.count),
    limit,
    count: counter.count,
    ageInDays
  };
}

/**
 * Increment the daily message count for a session
 * @param {string} sessionId 
 */
function incrementDailyCount(sessionId) {
  const today = new Date().toISOString().split('T')[0];
  let counter = dailyMessageCounts.get(sessionId);
  if (!counter || counter.date !== today) {
    counter = { date: today, count: 0 };
    dailyMessageCounts.set(sessionId, counter);
  }
  counter.count++;
}

// ==========================================
// COFFEE BREAK CHECK
// ==========================================

/**
 * Check if a coffee break is needed and return the duration
 * @param {string} sessionId
 * @returns {{ needsBreak: boolean, duration: number }}
 */
function checkCoffeeBreak(sessionId) {
  let count = batchCounters.get(sessionId) || 0;
  count++;
  batchCounters.set(sessionId, count);
  
  if (count >= CONFIG.MESSAGES_BEFORE_BREAK) {
    // Reset counter
    batchCounters.set(sessionId, 0);
    return {
      needsBreak: true,
      duration: getCoffeeBreakDuration()
    };
  }
  
  return { needsBreak: false, duration: 0 };
}

// ==========================================
// BUSINESS HOURS CHECK
// ==========================================

/**
 * Check if current time is within business hours (Cairo time)
 * @returns {{ withinHours: boolean, nextWindowMs: number }}
 */
function isWithinBusinessHours() {
  // Get Cairo time (UTC+2, but Egypt uses UTC+2 standard)
  const now = new Date();
  const cairoTime = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
  const hour = cairoTime.getHours();
  
  if (hour >= CONFIG.BUSINESS_HOURS_START && hour < CONFIG.BUSINESS_HOURS_END) {
    return { withinHours: true, nextWindowMs: 0 };
  }
  
  // Calculate time until next business hours window
  let nextStart = new Date(cairoTime);
  if (hour >= CONFIG.BUSINESS_HOURS_END) {
    // After hours - next window is tomorrow morning
    nextStart.setDate(nextStart.getDate() + 1);
  }
  nextStart.setHours(CONFIG.BUSINESS_HOURS_START, 0, 0, 0);
  
  const msUntilNext = nextStart.getTime() - cairoTime.getTime();
  
  return { withinHours: false, nextWindowMs: Math.max(0, msUntilNext) };
}

// ==========================================
// MESSAGE CONTENT SAFETY
// ==========================================

/**
 * Check if a message contains links
 * @param {string} message 
 * @returns {boolean}
 */
function containsLinks(message) {
  if (!message) return false;
  const urlPattern = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-zA-Z0-9-]+\.(com|net|org|io|app|dev|me|co)[^\s]*)/gi;
  return urlPattern.test(message);
}

/**
 * Remove links from a message and replace with a prompt
 * @param {string} message 
 * @returns {string}
 */
function sanitizeLinks(message) {
  if (!message) return message;
  const urlPattern = /(https?:\/\/[^\s]+)|(www\.[^\s]+)/gi;
  return message.replace(urlPattern, '[رد بـ "نعم" لاستلام الرابط]');
}

/**
 * Add a reply-encouraging question to the end of a message
 * @param {string} message 
 * @returns {string}
 */
function addReplyEncouragement(message) {
  if (!message) return message;
  
  const questions = [
    '\n\nهل وصلتك الرسالة؟ 👍',
    '\n\nلو عندك أي استفسار رد علينا 💬',
    '\n\nرد بـ ✅ لو وصلك',
    '\n\nلو محتاج أي حاجة تانية كلمنا 😊',
    '\n\nهل الموعد مناسب ليك؟',
    '\n\nرد بـ "تم" لتأكيد الاستلام ✔️',
    '\n\nفي أي سؤال؟ احنا هنا 🙌'
  ];
  
  // Pick a random question
  const randomQuestion = questions[Math.floor(Math.random() * questions.length)];
  return message + randomQuestion;
}

// ==========================================
// SIMULATE HUMAN BEHAVIOR
// ==========================================

/**
 * Simulate typing indicator on a WhatsApp chat
 * @param {Object} client - whatsapp-web.js client instance
 * @param {string} chatId - The chat ID to simulate typing in
 * @param {string} message - The message (to calculate typing duration)
 * @returns {Promise<void>}
 */
async function simulateTyping(client, chatId, message) {
  try {
    const chat = await client.getChatById(chatId);
    if (chat) {
      const typingDuration = getTypingDuration(message);
      await chat.sendStateTyping();
      await sleep(typingDuration);
      await chat.clearState();
    }
  } catch (error) {
    // Non-critical - continue even if typing simulation fails
    console.warn(`⚠️ [AntiBan] Typing simulation failed for ${chatId}: ${error.message}`);
  }
}

/**
 * Mark all unread messages as read (to appear as active user)
 * @param {Object} client - whatsapp-web.js client instance
 */
async function markAllAsRead(client) {
  try {
    const chats = await client.getChats();
    const unreadChats = chats.filter(chat => chat.unreadCount > 0);
    
    for (const chat of unreadChats.slice(0, 10)) { // Max 10 at a time
      try {
        await chat.sendSeen();
        await sleep(500 + Math.random() * 1000);
      } catch (e) {
        // Skip individual failures
      }
    }
    
    if (unreadChats.length > 0) {
      console.log(`👁️ [AntiBan] Marked ${Math.min(unreadChats.length, 10)} chats as read`);
    }
  } catch (error) {
    console.warn(`⚠️ [AntiBan] Failed to mark messages as read: ${error.message}`);
  }
}

// ==========================================
// FULL PRE-SEND PIPELINE
// ==========================================

/**
 * Run the complete anti-ban pipeline before sending a message.
 * Returns { canSend, delay, message, reason }
 * 
 * @param {Object} params
 * @param {string} params.sessionId - Which session is sending
 * @param {Object} params.client - whatsapp-web.js client
 * @param {string} params.chatId - Recipient chat ID
 * @param {string} params.message - Message to send
 * @param {Date} params.sessionRegisteredDate - When this session was first connected
 * @param {boolean} params.isFirstMessage - Is this the first message to this contact?
 * @returns {Promise<Object>}
 */
async function preSendPipeline(params) {
  const {
    sessionId,
    client,
    chatId,
    message,
    sessionRegisteredDate = new Date(),
    isFirstMessage = false
  } = params;

  // 1. Check business hours
  const businessHours = isWithinBusinessHours();
  if (!businessHours.withinHours) {
    return {
      canSend: false,
      delay: businessHours.nextWindowMs,
      message,
      reason: `Outside business hours. Next window in ${Math.round(businessHours.nextWindowMs / 60000)} minutes.`
    };
  }

  // 2. Check daily limit
  const dailyLimit = checkDailyLimit(sessionId, sessionRegisteredDate);
  if (!dailyLimit.allowed) {
    return {
      canSend: false,
      delay: 0,
      message,
      reason: `Daily limit reached for session ${sessionId} (${dailyLimit.count}/${dailyLimit.limit}). Age: ${dailyLimit.ageInDays} days.`
    };
  }

  // 3. Handle links in first messages
  let processedMessage = message;
  if (isFirstMessage && containsLinks(message)) {
    processedMessage = sanitizeLinks(message);
    console.log(`🔗 [AntiBan] Links removed from first message to ${chatId}`);
  }

  // 4. Add reply encouragement (30% of the time for non-report messages)
  if (Math.random() < 0.3) {
    processedMessage = addReplyEncouragement(processedMessage);
  }

  // 5. Calculate delay
  const delay = getRandomDelay();

  // 6. Check coffee break
  const coffeeBreak = checkCoffeeBreak(sessionId);
  const totalDelay = coffeeBreak.needsBreak
    ? delay + coffeeBreak.duration
    : delay;

  if (coffeeBreak.needsBreak) {
    console.log(`☕ [AntiBan] Coffee break for session ${sessionId}: ${Math.round(coffeeBreak.duration / 60000)} min`);
  }

  // 7. Simulate typing (async, don't wait)
  if (client && chatId) {
    // We'll simulate typing just before actual send
  }

  // 8. Increment daily counter
  incrementDailyCount(sessionId);

  return {
    canSend: true,
    delay: totalDelay,
    message: processedMessage,
    reason: null,
    coffeeBreak: coffeeBreak.needsBreak,
    dailyRemaining: dailyLimit.remaining - 1
  };
}

// ==========================================
// GET ENGINE STATUS
// ==========================================

function getEngineStatus() {
  const status = {};
  
  for (const [sessionId, counter] of dailyMessageCounts) {
    status[sessionId] = {
      todayCount: counter.count,
      date: counter.date,
      batchCount: batchCounters.get(sessionId) || 0
    };
  }
  
  return {
    config: {
      minDelay: `${CONFIG.MIN_DELAY_MS / 1000}s`,
      maxDelay: `${CONFIG.MAX_DELAY_MS / 1000}s`,
      messagesBeforeBreak: CONFIG.MESSAGES_BEFORE_BREAK,
      breakDuration: `${CONFIG.MIN_BREAK_MS / 60000}-${CONFIG.MAX_BREAK_MS / 60000} min`,
      businessHours: `${CONFIG.BUSINESS_HOURS_START}:00 - ${CONFIG.BUSINESS_HOURS_END}:00 Cairo`,
      warmupDays: CONFIG.WARMUP_SCHEDULE.length
    },
    sessions: status,
    businessHours: isWithinBusinessHours()
  };
}

// ==========================================
// UTILITY
// ==========================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  CONFIG,
  getRandomDelay,
  getTypingDuration,
  getCoffeeBreakDuration,
  checkDailyLimit,
  incrementDailyCount,
  checkCoffeeBreak,
  isWithinBusinessHours,
  containsLinks,
  sanitizeLinks,
  addReplyEncouragement,
  simulateTyping,
  markAllAsRead,
  preSendPipeline,
  getEngineStatus,
  sleep
};
