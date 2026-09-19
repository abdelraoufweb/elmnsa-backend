// ==========================================
// WHATSAPP AUTOMATION SERVICE v2
// ==========================================
// Complete rewrite integrating:
//   - Multi-Session Manager (10+ devices)
//   - AI Message Rephrasing (4 API fallback)
//   - Anti-Ban Engine (human behavior simulation)
//   - Smart Queue with rate limiting
//   - 3-day admin report cron
//
// Architecture:
//   whatsappService (this file) = Orchestrator
//     ├── whatsappMultiSession.js = Device management
//     ├── aiRephraseService.js    = Message variation
//     └── antiBanEngine.js        = Ban prevention

const cron = require('node-cron');
const WhatsAppLog = require('../models/WhatsAppLog');
const { toWhatsAppId, toDisplayFormat, isValidWhatsAppNumber } = require('../utils/phoneFormatter');
const { getAdminPhones, getAllStaffPhones } = require('../config/whatsappContacts');

// Sub-services
const multiSession = require('./whatsappMultiSession');
const antiBan = require('./antiBanEngine');
const aiRephrase = require('./aiRephraseService');

// ==========================================
// STATE
// ==========================================

let io = null;
let messageQueue = [];
let isProcessingQueue = false;
let reportCronJob = null;
let retryCronJob = null;
let midnightResetJob = null;

// Queue configuration
const BATCH_SIZE = 10; // Process 10 messages per batch cycle

// ==========================================
// INITIALIZATION
// ==========================================

/**
 * Initialize the WhatsApp automation system
 * @param {Object} socketIo - Socket.io server instance
 */
async function initialize(socketIo) {
  io = socketIo;

  // Pass Socket.IO to multi-session manager
  multiSession.setSocketIO(socketIo);

  // Create default session slots (admin connects them manually via UI)
  multiSession.initializeDefaultSessions(10);

  // Start cron jobs
  startReportCron();
  startMidnightReset();

  console.log('✅ [WhatsApp v2] Multi-session automation system initialized');
  console.log(`📱 [WhatsApp v2] ${multiSession.getAllSessionsInfo().totalSessions} session slots ready`);
  console.log(`🤖 [WhatsApp v2] AI providers: ${aiRephrase.getProviderStatus().filter(p => p.configured).map(p => p.name).join(', ') || 'None configured'}`);
}

// ==========================================
// SESSION MANAGEMENT (exposed to controller)
// ==========================================

/**
 * Connect a specific session
 * @param {string} sessionId 
 */
async function connectSessionById(sessionId) {
  return await multiSession.connectSession(sessionId);
}

/**
 * Disconnect a specific session
 * @param {string} sessionId
 */
async function disconnectSessionById(sessionId) {
  return await multiSession.disconnectSession(sessionId);
}

/**
 * Logout a session (clears auth, needs new QR)
 * @param {string} sessionId
 */
async function logoutSessionById(sessionId) {
  return await multiSession.logoutSession(sessionId);
}

/**
 * Create a new session slot
 * @param {string} id 
 * @param {string} label 
 */
function createNewSession(id, label) {
  return multiSession.createSession(id, label);
}

/**
 * Remove a session
 * @param {string} sessionId
 */
async function removeSessionById(sessionId) {
  return await multiSession.removeSession(sessionId);
}

// ==========================================
// STATUS
// ==========================================

function getStatusInfo() {
  const sessionsInfo = multiSession.getAllSessionsInfo();
  return {
    // Legacy compatibility
    status: multiSession.isAnyConnected() ? 'connected' : 'disconnected',
    connected: multiSession.isAnyConnected(),
    
    // New multi-session info
    ...sessionsInfo,
    
    // Queue info
    queueLength: messageQueue.length,
    isProcessing: isProcessingQueue,
    
    // AI status
    aiProviders: aiRephrase.getProviderStatus(),
    
    // Anti-ban status
    antiBan: antiBan.getEngineStatus(),
    
    timestamp: new Date().toISOString()
  };
}

function isConnected() {
  return multiSession.isAnyConnected();
}

// ==========================================
// MESSAGE SENDING (CORE)
// ==========================================

/**
 * Send a single WhatsApp message through the multi-session system
 * @param {string} phone - Recipient phone number (any format)
 * @param {string} message - Message text
 * @param {Object} logData - Additional data for logging
 * @returns {Promise<Object>} - { success, logId, error }
 */
async function sendMessage(phone, message, logData = {}) {
  // Validate phone number
  if (!isValidWhatsAppNumber(phone)) {
    console.error(`❌ [WhatsApp v2] Invalid phone number: ${phone}`);
    const log = await createLog({
      ...logData,
      recipientPhone: phone,
      messageBody: message,
      status: 'failed',
      errorMessage: 'Invalid phone number format'
    });
    return { success: false, logId: log?._id, error: 'Invalid phone number' };
  }

  // Deduplication check
  const dedupKey = logData.deduplicationKey || `${phone}:${logData.type}:${message.substring(0, 50)}:${new Date().toISOString().split('T')[0]}`;

  const existingLog = await WhatsAppLog.findOne({
    deduplicationKey: dedupKey,
    status: 'sent',
    timestamp: { $gte: new Date(Date.now() - 3600000) }
  });

  if (existingLog) {
    console.log(`⚠️ [WhatsApp v2] Duplicate blocked for ${toDisplayFormat(phone)}`);
    return { success: true, logId: existingLog._id, error: null, deduplicated: true };
  }

  // Create log entry
  const log = await createLog({
    ...logData,
    recipientPhone: phone,
    messageBody: message,
    status: 'queued',
    deduplicationKey: dedupKey
  });

  // Add to queue
  messageQueue.push({
    phone,
    originalMessage: message,
    logId: log._id,
    logData
  });

  // Trigger queue processing
  processQueue();

  return { success: true, logId: log._id, error: null };
}

/**
 * Send messages to multiple recipients with AI rephrasing
 * @param {Array} recipients - Array of { phone, message, logData }
 * @returns {Promise<Object>} - { totalSent, totalFailed, totalDeduplicated }
 */
async function sendBatch(recipients) {
  let totalSent = 0;
  let totalFailed = 0;
  let totalDeduplicated = 0;

  for (const recipient of recipients) {
    const result = await sendMessage(recipient.phone, recipient.message, recipient.logData || {});
    if (result.deduplicated) {
      totalDeduplicated++;
    } else if (result.success) {
      totalSent++;
    } else {
      totalFailed++;
    }
  }

  return { totalSent, totalFailed, totalDeduplicated };
}

// ==========================================
// MESSAGE QUEUE PROCESSOR
// ==========================================

async function processQueue() {
  if (isProcessingQueue) return;
  if (!multiSession.isAnyConnected()) return;
  if (messageQueue.length === 0) return;

  isProcessingQueue = true;

  console.log(`📤 [WhatsApp v2] Processing queue: ${messageQueue.length} messages across ${multiSession.getConnectedCount()} sessions`);

  let processed = 0;

  while (messageQueue.length > 0 && multiSession.isAnyConnected() && processed < BATCH_SIZE) {
    const item = messageQueue.shift();

    try {
      // 1. Get the best session to send through
      const session = multiSession.getBestSession();
      if (!session) {
        messageQueue.unshift(item); // Put back
        console.warn('⚠️ [WhatsApp v2] No connected sessions available');
        break;
      }

      const chatId = toWhatsAppId(item.phone);
      if (!chatId) {
        await updateLogStatus(item.logId, 'failed', 'Invalid chat ID');
        processed++;
        continue;
      }

      // 2. Run anti-ban pipeline
      const pipeline = await antiBan.preSendPipeline({
        sessionId: session.id,
        client: session.client,
        chatId,
        message: item.originalMessage,
        sessionRegisteredDate: session.registeredDate,
        isFirstMessage: true // Conservative: treat all as first
      });

      if (!pipeline.canSend) {
        console.warn(`⚠️ [WhatsApp v2] Anti-ban blocked: ${pipeline.reason}`);
        // Re-queue the message for later
        messageQueue.push(item);
        
        if (pipeline.delay > 0) {
          // Wait and try again later
          console.log(`⏰ [WhatsApp v2] Waiting ${Math.round(pipeline.delay / 60000)} min before retrying...`);
          break;
        }
        processed++;
        continue;
      }

      // 3. AI Rephrase the message (make it unique)
      let finalMessage;
      try {
        finalMessage = await aiRephrase.rephraseMessage(pipeline.message, {
          recipientName: item.logData?.recipientName || ''
        });
      } catch (rephraseError) {
        console.warn(`⚠️ [WhatsApp v2] AI rephrase failed, using processed message`);
        finalMessage = pipeline.message;
      }

      // 4. Wait the anti-ban delay
      if (pipeline.delay > 0) {
        const delaySec = Math.round(pipeline.delay / 1000);
        console.log(`⏳ [WhatsApp v2] Waiting ${delaySec}s before sending (anti-ban)...`);
        await antiBan.sleep(pipeline.delay);
      }

      // 5. Verify number is on WhatsApp
      let isRegistered = true;
      try {
        isRegistered = await session.client.isRegisteredUser(chatId);
      } catch (regErr) {
        console.warn(`⚠️ [WhatsApp v2] Could not verify ${chatId}: ${regErr.message}`);
        isRegistered = true; // Assume registered
      }

      if (!isRegistered) {
        console.warn(`⚠️ [WhatsApp v2] Not on WhatsApp: ${toDisplayFormat(item.phone)}`);
        await updateLogStatus(item.logId, 'failed', 'Number not registered on WhatsApp');
        processed++;
        continue;
      }

      // 6. Simulate typing before sending
      await antiBan.simulateTyping(session.client, chatId, finalMessage);

      // 7. SEND THE MESSAGE
      await session.client.sendMessage(chatId, finalMessage);

      // 8. Update counters & log
      session.messagesSentToday++;
      session.lastMessageTime = new Date();
      await updateLogStatus(item.logId, 'sent', null, session.id);

      console.log(`✅ [WhatsApp v2] Sent via ${session.id} (${session.label}) to ${toDisplayFormat(item.phone)} [${session.messagesSentToday} today]`);

      // 9. Coffee break check
      if (pipeline.coffeeBreak) {
        console.log(`☕ [WhatsApp v2] Taking coffee break...`);
      }

    } catch (error) {
      console.error(`❌ [WhatsApp v2] Send error for ${toDisplayFormat(item.phone)}:`, error.message);
      await updateLogStatus(item.logId, 'failed', error.message);

      // If connection error, stop processing
      if (error.message.includes('not connected') || error.message.includes('Session closed')) {
        messageQueue.unshift(item);
        break;
      }
    }

    processed++;
  }

  isProcessingQueue = false;

  // Schedule next batch if more messages remain
  if (messageQueue.length > 0 && multiSession.isAnyConnected()) {
    const nextBatchDelay = 30000 + Math.random() * 30000; // 30-60 seconds
    console.log(`📋 [WhatsApp v2] ${messageQueue.length} messages remaining. Next batch in ${Math.round(nextBatchDelay / 1000)}s`);
    setTimeout(() => processQueue(), nextBatchDelay);
  }
}

// ==========================================
// LOGGING HELPERS
// ==========================================

async function createLog(data) {
  try {
    const log = new WhatsAppLog({
      type: data.type || 'content',
      recipientPhone: data.recipientPhone,
      recipientName: data.recipientName || 'Unknown',
      recipientType: data.recipientType || 'student',
      studentId: data.studentId || null,
      messageBody: data.messageBody,
      status: data.status || 'queued',
      errorMessage: data.errorMessage || null,
      deduplicationKey: data.deduplicationKey || null
    });
    return await log.save();
  } catch (error) {
    console.error('❌ [WhatsApp v2] Log creation error:', error.message);
    return null;
  }
}

async function updateLogStatus(logId, status, errorMessage = null, sessionId = null) {
  try {
    if (!logId) return;
    const update = { status };
    if (status === 'sent') update.sentAt = new Date();
    if (errorMessage) update.errorMessage = errorMessage;
    if (sessionId) update.sessionId = sessionId;
    await WhatsAppLog.findByIdAndUpdate(logId, update);
  } catch (error) {
    console.error('❌ [WhatsApp v2] Log update error:', error.message);
  }
}

// ==========================================
// RETRY FAILED MESSAGES
// ==========================================

async function retryFailedMessages() {
  try {
    if (!multiSession.isAnyConnected()) return;

    const failedLogs = await WhatsAppLog.find({
      status: 'failed',
      retryCount: { $lt: 1 },
      timestamp: { $gte: new Date(Date.now() - 600000) } // Last 10 minutes
    }).limit(5);

    if (failedLogs.length === 0) return;

    console.log(`🔄 [WhatsApp v2] Retrying ${failedLogs.length} failed messages...`);

    for (const log of failedLogs) {
      log.retryCount += 1;
      log.status = 'retrying';
      await log.save();

      messageQueue.push({
        phone: log.recipientPhone,
        originalMessage: log.messageBody,
        logId: log._id,
        logData: {
          type: log.type,
          recipientName: log.recipientName,
          recipientType: log.recipientType,
          studentId: log.studentId
        }
      });
    }

    processQueue();
  } catch (error) {
    console.error('❌ [WhatsApp v2] Retry error:', error.message);
  }
}

// ==========================================
// CRON JOBS
// ==========================================

function startReportCron() {
  if (reportCronJob) reportCronJob.stop();

  // Run every 3 days at 10:00 AM Cairo time
  reportCronJob = cron.schedule('0 10 */3 * *', async () => {
    console.log('📊 [WhatsApp v2] Generating 3-day admin report...');
    await generateAndSendReport();
  }, { timezone: 'Africa/Cairo' });

  // Retry failed messages every 15 minutes
  if (retryCronJob) retryCronJob.stop();
  retryCronJob = cron.schedule('*/15 * * * *', () => {
    retryFailedMessages();
  });

  console.log('✅ [WhatsApp v2] Cron jobs scheduled');
}

function startMidnightReset() {
  if (midnightResetJob) midnightResetJob.stop();

  // Reset daily counters at midnight Cairo time
  midnightResetJob = cron.schedule('0 0 * * *', () => {
    multiSession.resetDailyCounters();
  }, { timezone: 'Africa/Cairo' });
}

// ==========================================
// 3-DAY REPORT
// ==========================================

async function generateAndSendReport() {
  try {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

    const logs = await WhatsAppLog.find({
      reported: false,
      timestamp: { $gte: threeDaysAgo }
    });

    if (logs.length === 0) {
      console.log('📊 [WhatsApp v2] No new messages to report.');
      return;
    }

    const stats = {
      total: logs.length,
      sent: logs.filter(l => l.status === 'sent').length,
      failed: logs.filter(l => l.status === 'failed').length,
      byType: {},
      studentsContacted: new Set(),
      parentsContacted: new Set()
    };

    logs.forEach(log => {
      stats.byType[log.type] = (stats.byType[log.type] || 0) + 1;
      if (log.recipientType === 'student') stats.studentsContacted.add(log.recipientPhone);
      if (log.recipientType === 'parent') stats.parentsContacted.add(log.recipientPhone);
    });

    const typeBreakdown = Object.entries(stats.byType)
      .map(([type, count]) => `  • ${type}: ${count}`)
      .join('\n');

    const sessionsInfo = multiSession.getAllSessionsInfo();

    const reportMessage = `📊 *تقرير نظام الواتساب v2 (آخر 3 أيام)*
━━━━━━━━━━━━━━━━━━━━

📨 إجمالي الرسائل: ${stats.total}
✅ مرسلة بنجاح: ${stats.sent}
❌ فشلت: ${stats.failed}

👨‍🎓 طلاب تم التواصل معهم: ${stats.studentsContacted.size}
👨‍👩‍👧 أولياء أمور تم التواصل معهم: ${stats.parentsContacted.size}

📋 *تفاصيل حسب النوع:*
${typeBreakdown}

📱 *حالة الأجهزة:*
  • متصلة: ${sessionsInfo.connectedSessions}/${sessionsInfo.totalSessions}

━━━━━━━━━━━━━━━━━━━━
🕐 ${new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}`;

    const adminPhones = getAdminPhones();
    for (const admin of adminPhones) {
      await sendMessage(admin.phone, reportMessage, {
        type: 'report',
        recipientName: admin.name,
        recipientType: 'admin'
      });
    }

    await WhatsAppLog.updateMany(
      { _id: { $in: logs.map(l => l._id) } },
      { reported: true, reportedAt: new Date() }
    );

    console.log('✅ [WhatsApp v2] Admin report sent successfully.');
  } catch (error) {
    console.error('❌ [WhatsApp v2] Report error:', error.message);
  }
}

// ==========================================
// PUBLIC HELPERS FOR CONTROLLERS
// ==========================================

async function notifyAllStaff(message, type = 'registration') {
  const staff = getAllStaffPhones();
  const recipients = staff.map(s => ({
    phone: s.phone,
    message,
    logData: {
      type,
      recipientName: s.name,
      recipientType: s.role
    }
  }));
  return await sendBatch(recipients);
}

async function notifyAdmins(message, type = 'report') {
  const admins = getAdminPhones();
  const recipients = admins.map(a => ({
    phone: a.phone,
    message,
    logData: {
      type,
      recipientName: a.name,
      recipientType: 'admin'
    }
  }));
  return await sendBatch(recipients);
}

async function notifyStudent(student, message, type = 'content') {
  return await sendMessage(student.phoneNumber, message, {
    type,
    studentId: student._id,
    recipientName: `${student.firstName} ${student.lastName}`,
    recipientType: 'student'
  });
}

async function notifyParent(student, message, type = 'grade') {
  if (!student.parentPhone) {
    console.warn(`⚠️ [WhatsApp v2] No parent phone for ${student.firstName} ${student.lastName}`);
    return { success: false, error: 'No parent phone' };
  }

  return await sendMessage(student.parentPhone, message, {
    type,
    studentId: student._id,
    recipientName: `ولي أمر ${student.firstName}`,
    recipientType: 'parent'
  });
}

// ==========================================
// CLEANUP
// ==========================================

async function disconnect() {
  if (reportCronJob) reportCronJob.stop();
  if (retryCronJob) retryCronJob.stop();
  if (midnightResetJob) midnightResetJob.stop();

  await multiSession.disconnectAll();
  console.log('🛑 [WhatsApp v2] All sessions disconnected');
}

async function logout() {
  // Logout all sessions
  const sessionsInfo = multiSession.getAllSessionsInfo();
  for (const session of sessionsInfo.sessions) {
    await multiSession.logoutSession(session.id).catch(() => {});
  }
  await disconnect();
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  // Initialization
  initialize,
  disconnect,
  logout,

  // Status
  getStatusInfo,
  isConnected,

  // Session management
  connectSessionById,
  disconnectSessionById,
  logoutSessionById,
  createNewSession,
  removeSessionById,

  // Messaging
  sendMessage,
  sendBatch,
  notifyAllStaff,
  notifyAdmins,
  notifyStudent,
  notifyParent,

  // Reporting
  generateAndSendReport,

  // Sub-service access
  multiSession,
  antiBan,
  aiRephrase
};
