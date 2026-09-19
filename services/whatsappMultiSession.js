// ==========================================
// WHATSAPP MULTI-SESSION MANAGER
// ==========================================
// Manages up to 10+ WhatsApp device sessions simultaneously.
// Each session is an independent whatsapp-web.js client with
// its own auth, QR code, and connection state.
//
// Features:
//   - Round-robin message distribution across sessions
//   - Smart session selection (least-used, healthiest)
//   - Individual session connect/disconnect/logout
//   - Centralized status dashboard
//   - Session health monitoring
//   - Automatic failover when a session dies

const { Client, LocalAuth } = require('whatsapp-web.js');
const path = require('path');

// ==========================================
// SESSION STATE
// ==========================================

/**
 * @typedef {Object} Session
 * @property {string} id - Unique session identifier (e.g., "session_1")
 * @property {string} label - Human-friendly label (e.g., "رقم 1")
 * @property {Object|null} client - whatsapp-web.js Client instance
 * @property {string} status - 'disconnected' | 'connecting' | 'qr_pending' | 'connected'
 * @property {string|null} qr - Current QR code data (if pending)
 * @property {string|null} phoneNumber - Connected phone number
 * @property {string|null} lastError - Last error message
 * @property {Date} registeredDate - When this session was first connected
 * @property {number} messagesSentToday - Messages sent today
 * @property {Date|null} lastMessageTime - Time of last sent message
 * @property {boolean} initInProgress - Whether initialization is in progress
 */

const sessions = new Map();
let io = null;
let roundRobinIndex = 0;

// Maximum sessions allowed
const MAX_SESSIONS = 15;

// ==========================================
// SESSION LIFECYCLE
// ==========================================

/**
 * Set the Socket.IO instance for real-time updates
 * @param {Object} socketIo 
 */
function setSocketIO(socketIo) {
  io = socketIo;
}

/**
 * Create a new session slot (does not connect it)
 * @param {string} id - Session ID (e.g., "session_1")
 * @param {string} label - Display label (e.g., "رقم 1")
 * @returns {Object} The created session info
 */
function createSession(id, label = '') {
  if (sessions.size >= MAX_SESSIONS) {
    throw new Error(`Maximum ${MAX_SESSIONS} sessions allowed`);
  }

  if (sessions.has(id)) {
    throw new Error(`Session "${id}" already exists`);
  }

  const session = {
    id,
    label: label || `جهاز ${sessions.size + 1}`,
    client: null,
    status: 'disconnected',
    qr: null,
    phoneNumber: null,
    lastError: null,
    registeredDate: new Date(),
    messagesSentToday: 0,
    lastMessageTime: null,
    initInProgress: false
  };

  sessions.set(id, session);
  broadcastStatus();
  console.log(`📱 [MultiSession] Created session: ${id} (${session.label})`);
  return getSessionInfo(id);
}

/**
 * Initialize and connect a session
 * @param {string} sessionId 
 * @returns {Promise<void>}
 */
async function connectSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Session "${sessionId}" not found`);
  if (session.initInProgress) {
    console.log(`⚠️ [MultiSession] Session ${sessionId} already initializing...`);
    return;
  }

  session.initInProgress = true;

  try {
    // Destroy existing client if any
    if (session.client) {
      try {
        await session.client.destroy();
      } catch (e) {
        console.warn(`⚠️ [MultiSession] Error destroying old client for ${sessionId}:`, e.message);
      }
      session.client = null;
    }

    updateSessionStatus(sessionId, 'connecting');

    console.log(`🔄 [MultiSession] Connecting session: ${sessionId}...`);

    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: sessionId,
        dataPath: './.wwebjs_auth'
      }),
      puppeteer: {
        headless: 'new',
        args: [
          '--headless=new',
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-extensions',
          '--disable-software-rasterizer',
          '--disable-background-networking',
          '--disable-default-apps',
          '--disable-sync',
          '--disable-translate',
          '--hide-scrollbars',
          '--metrics-recording-only',
          '--mute-audio',
          '--safebrowsing-disable-auto-update',
          '--disable-dbus',
          '--disable-features=VizDisplayCompositor,TranslateUI',
          '--disable-ipc-flooding-protection',
          '--password-store=basic',
          '--use-mock-keychain',
          '--single-process', // Aggressive memory saving (runs everything in one process)
          '--renderer-process-limit=1', // Limits number of processes
          '--js-flags="--max-old-space-size=256"', // Limits V8 engine memory
          '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
        ]
      },
      webVersionCache: { type: 'local' }
    });

    // ── Event: QR Code ──────────────────────
    client.on('qr', (qr) => {
      console.log(`📱 [MultiSession] QR for ${sessionId} - Scan to connect`);
      session.qr = qr;
      updateSessionStatus(sessionId, 'qr_pending');

      if (io) {
        io.to('role:admin').emit('whatsapp:qr', { sessionId, qr });
        io.to('role:developer').emit('whatsapp:qr', { sessionId, qr });
      }
    });

    // ── Event: Authenticated ────────────────
    client.on('authenticated', () => {
      console.log(`✅ [MultiSession] Session ${sessionId} authenticated`);
      session.qr = null;
    });

    // ── Event: Ready ────────────────────────
    client.on('ready', async () => {
      console.log(`✅ [MultiSession] Session ${sessionId} is READY!`);
      session.qr = null;
      session.lastError = null;
      updateSessionStatus(sessionId, 'connected');

      // Try to get the connected phone number
      try {
        const info = client.info;
        session.phoneNumber = info?.wid?.user || null;
        console.log(`📞 [MultiSession] Session ${sessionId} phone: ${session.phoneNumber}`);
      } catch (e) {
        console.warn(`⚠️ [MultiSession] Could not get phone for ${sessionId}`);
      }
    });

    // ── Event: Auth Failure ─────────────────
    client.on('auth_failure', (msg) => {
      console.error(`❌ [MultiSession] Auth failure for ${sessionId}:`, msg);
      session.lastError = `Auth failure: ${msg}`;
      updateSessionStatus(sessionId, 'disconnected');
      session.initInProgress = false;
    });

    // ── Event: Disconnected ─────────────────
    client.on('disconnected', (reason) => {
      console.warn(`⚠️ [MultiSession] Session ${sessionId} disconnected:`, reason);
      session.lastError = reason;
      updateSessionStatus(sessionId, 'disconnected');

      // Auto-reconnect after 60 seconds
      setTimeout(() => {
        if (sessions.has(sessionId) && sessions.get(sessionId).status === 'disconnected') {
          console.log(`🔄 [MultiSession] Auto-reconnecting session ${sessionId}...`);
          session.initInProgress = false;
          connectSession(sessionId).catch(err => {
            console.error(`❌ [MultiSession] Auto-reconnect failed for ${sessionId}:`, err.message);
          });
        }
      }, 60000);
    });

    // ── Event: Connection state change ──────
    client.on('change_state', (state) => {
      console.log(`📡 [MultiSession] ${sessionId} state: ${state}`);
    });

    // ── Event: Incoming message (mark as read) ──
    client.on('message', async (msg) => {
      try {
        // Mark as read to appear as active user
        const chat = await msg.getChat();
        await chat.sendSeen();
      } catch (e) {
        // Non-critical
      }
    });

    session.client = client;

    // Initialize the client
    await client.initialize();
    session.initInProgress = false;

  } catch (error) {
    console.error(`❌ [MultiSession] Init error for ${sessionId}:`, error.message);
    session.lastError = error.message;
    updateSessionStatus(sessionId, 'disconnected');
    session.initInProgress = false;

    // Retry after 2 minutes
    setTimeout(() => {
      if (sessions.has(sessionId) && sessions.get(sessionId).status === 'disconnected') {
        console.log(`🔄 [MultiSession] Retrying ${sessionId}...`);
        connectSession(sessionId).catch(err => {
          console.error(`❌ [MultiSession] Retry failed for ${sessionId}:`, err.message);
        });
      }
    }, 120000);
  }
}

/**
 * Disconnect a session (keep auth data for reconnect)
 * @param {string} sessionId 
 */
async function disconnectSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Session "${sessionId}" not found`);

  if (session.client) {
    try {
      await session.client.destroy();
    } catch (e) {
      console.warn(`⚠️ [MultiSession] Error disconnecting ${sessionId}:`, e.message);
    }
    session.client = null;
  }

  updateSessionStatus(sessionId, 'disconnected');
  console.log(`🛑 [MultiSession] Session ${sessionId} disconnected`);
}

/**
 * Logout a session (clears auth, needs new QR scan)
 * @param {string} sessionId 
 */
async function logoutSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Session "${sessionId}" not found`);

  if (session.client) {
    try {
      await session.client.logout();
    } catch (e) {
      console.warn(`⚠️ [MultiSession] Logout error for ${sessionId}:`, e.message);
    }
  }

  await disconnectSession(sessionId);
  session.phoneNumber = null;
  session.registeredDate = new Date(); // Reset warm-up
  console.log(`🚪 [MultiSession] Session ${sessionId} logged out`);
}

/**
 * Remove a session entirely
 * @param {string} sessionId 
 */
async function removeSession(sessionId) {
  await disconnectSession(sessionId).catch(() => {});
  sessions.delete(sessionId);
  broadcastStatus();
  console.log(`🗑️ [MultiSession] Session ${sessionId} removed`);
}

// ==========================================
// SESSION SELECTION (SMART ROUTING)
// ==========================================

/**
 * Get the best session to send a message through.
 * Uses a smart algorithm:
 *   1. Filter to only connected sessions
 *   2. Filter out sessions at their daily limit
 *   3. Pick the one with least messages sent today (load balance)
 *   4. Fall back to round-robin if tied
 * 
 * @returns {Object|null} The best session or null if none available
 */
function getBestSession() {
  const connected = [];

  for (const [id, session] of sessions) {
    if (session.status === 'connected' && session.client) {
      connected.push(session);
    }
  }

  if (connected.length === 0) return null;

  // Sort by messages sent today (ascending) for load balancing
  connected.sort((a, b) => a.messagesSentToday - b.messagesSentToday);

  // Return the least-used session
  return connected[0];
}

/**
 * Get next session using round-robin (simple rotation)
 * @returns {Object|null}
 */
function getNextSessionRoundRobin() {
  const connected = [];

  for (const [id, session] of sessions) {
    if (session.status === 'connected' && session.client) {
      connected.push(session);
    }
  }

  if (connected.length === 0) return null;

  roundRobinIndex = (roundRobinIndex + 1) % connected.length;
  return connected[roundRobinIndex];
}

/**
 * Get a specific session by ID
 * @param {string} sessionId 
 * @returns {Object|null}
 */
function getSession(sessionId) {
  return sessions.get(sessionId) || null;
}

// ==========================================
// STATUS & MONITORING
// ==========================================

function updateSessionStatus(sessionId, status) {
  const session = sessions.get(sessionId);
  if (!session) return;

  session.status = status;
  broadcastStatus();
}

function broadcastStatus() {
  if (!io) return;

  const allStatus = getAllSessionsInfo();
  io.to('role:admin').emit('whatsapp:multi-status', allStatus);
  io.to('role:developer').emit('whatsapp:multi-status', allStatus);
}

function getSessionInfo(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return null;

  return {
    id: session.id,
    label: session.label,
    status: session.status,
    qr: session.qr,
    phoneNumber: session.phoneNumber,
    lastError: session.lastError,
    registeredDate: session.registeredDate,
    messagesSentToday: session.messagesSentToday,
    lastMessageTime: session.lastMessageTime,
    connected: session.status === 'connected'
  };
}

function getAllSessionsInfo() {
  const result = [];
  for (const [id, session] of sessions) {
    result.push(getSessionInfo(id));
  }
  return {
    sessions: result,
    totalSessions: sessions.size,
    connectedSessions: result.filter(s => s.connected).length,
    maxSessions: MAX_SESSIONS,
    timestamp: new Date().toISOString()
  };
}

/**
 * Check if ANY session is connected
 */
function isAnyConnected() {
  for (const [id, session] of sessions) {
    if (session.status === 'connected') return true;
  }
  return false;
}

/**
 * Get count of connected sessions
 */
function getConnectedCount() {
  let count = 0;
  for (const [id, session] of sessions) {
    if (session.status === 'connected') count++;
  }
  return count;
}

// ==========================================
// CONNECT ALL / DISCONNECT ALL
// ==========================================

/**
 * Connect all created sessions
 */
async function connectAll() {
  const promises = [];
  for (const [id, session] of sessions) {
    if (session.status === 'disconnected') {
      promises.push(
        connectSession(id).catch(err => {
          console.error(`❌ [MultiSession] Failed to connect ${id}:`, err.message);
        })
      );
      // Stagger connections to avoid resource spike
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

/**
 * Disconnect all sessions
 */
async function disconnectAll() {
  for (const [id, session] of sessions) {
    await disconnectSession(id).catch(() => {});
  }
}

// ==========================================
// DAILY COUNTER RESET (call at midnight)
// ==========================================

function resetDailyCounters() {
  for (const [id, session] of sessions) {
    session.messagesSentToday = 0;
  }
  console.log('🔄 [MultiSession] Daily message counters reset');
}

// ==========================================
// INITIALIZE DEFAULT SESSIONS
// ==========================================

/**
 * Create default session slots (called on server start)
 * Doesn't connect them - admin must connect manually
 * @param {number} count - Number of sessions to create
 */
function initializeDefaultSessions(count = 5) {
  for (let i = 1; i <= count; i++) {
    const id = `session_${i}`;
    if (!sessions.has(id)) {
      createSession(id, `جهاز ${i}`);
    }
  }
  console.log(`📱 [MultiSession] ${count} session slots created`);
}

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  setSocketIO,
  createSession,
  connectSession,
  disconnectSession,
  logoutSession,
  removeSession,
  getBestSession,
  getNextSessionRoundRobin,
  getSession,
  getSessionInfo,
  getAllSessionsInfo,
  isAnyConnected,
  getConnectedCount,
  connectAll,
  disconnectAll,
  resetDailyCounters,
  initializeDefaultSessions,
  sessions, // Expose for direct access if needed
  MAX_SESSIONS
};
