// ==========================================
// WHATSAPP CONTROLLER v2
// ==========================================
// API endpoints for WhatsApp Multi-Session management.
// Handles: sessions CRUD, connection, QR codes, logs,
// AI rephrase status, anti-ban engine status.

const whatsappService = require('../services/whatsappService');
const WhatsAppLog = require('../models/WhatsAppLog');

// ==========================================
// SYSTEM STATUS
// ==========================================

/**
 * GET /api/whatsapp/status
 * Get full system status (all sessions + AI + anti-ban)
 */
exports.getStatus = async (req, res) => {
  try {
    const status = whatsappService.getStatusInfo();
    res.json({ success: true, data: status });
  } catch (error) {
    console.error('WhatsApp status error:', error);
    res.status(500).json({ success: false, message: 'Failed to get status' });
  }
};

// ==========================================
// SESSION MANAGEMENT
// ==========================================

/**
 * GET /api/whatsapp/sessions
 * List all sessions with their status
 */
exports.getSessions = async (req, res) => {
  try {
    const sessions = whatsappService.multiSession.getAllSessionsInfo();
    res.json({ success: true, data: sessions });
  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({ success: false, message: 'Failed to get sessions' });
  }
};

/**
 * POST /api/whatsapp/sessions
 * Create a new session slot
 * Body: { id?: string, label?: string }
 */
exports.createSession = async (req, res) => {
  try {
    const { id, label } = req.body;
    const sessionId = id || `session_${Date.now()}`;
    const result = whatsappService.createNewSession(sessionId, label);
    res.json({ success: true, message: `Session "${sessionId}" created`, data: result });
  } catch (error) {
    console.error('Create session error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/whatsapp/sessions/:sessionId/connect
 * Connect a specific session (triggers QR code)
 */
exports.connectSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    await whatsappService.connectSessionById(sessionId);
    res.json({ success: true, message: `Session "${sessionId}" connecting. Watch for QR code.` });
  } catch (error) {
    console.error('Connect session error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/whatsapp/sessions/:sessionId/disconnect
 * Disconnect a session (keeps auth for reconnect)
 */
exports.disconnectSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    await whatsappService.disconnectSessionById(sessionId);
    res.json({ success: true, message: `Session "${sessionId}" disconnected.` });
  } catch (error) {
    console.error('Disconnect session error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/whatsapp/sessions/:sessionId/logout
 * Logout a session (clears auth, needs new QR scan)
 */
exports.logoutSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    await whatsappService.logoutSessionById(sessionId);
    res.json({ success: true, message: `Session "${sessionId}" logged out. Session cleared.` });
  } catch (error) {
    console.error('Logout session error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * DELETE /api/whatsapp/sessions/:sessionId
 * Remove a session entirely
 */
exports.removeSession = async (req, res) => {
  try {
    const { sessionId } = req.params;
    await whatsappService.removeSessionById(sessionId);
    res.json({ success: true, message: `Session "${sessionId}" removed.` });
  } catch (error) {
    console.error('Remove session error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ==========================================
// LEGACY CONNECTION ENDPOINTS (backward compat)
// ==========================================

/**
 * POST /api/whatsapp/connect
 * Legacy: Connect the first available session
 */
exports.connect = async (req, res) => {
  try {
    // Connect session_1 by default for backward compatibility
    await whatsappService.connectSessionById('session_1');
    res.json({ success: true, message: 'WhatsApp session_1 connecting. Watch for QR code.' });
  } catch (error) {
    console.error('WhatsApp connect error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/whatsapp/disconnect
 * Legacy: Disconnect all sessions
 */
exports.disconnect = async (req, res) => {
  try {
    await whatsappService.disconnect();
    res.json({ success: true, message: 'All WhatsApp sessions disconnected.' });
  } catch (error) {
    console.error('WhatsApp disconnect error:', error);
    res.status(500).json({ success: false, message: 'Failed to disconnect' });
  }
};

/**
 * POST /api/whatsapp/logout
 * Legacy: Logout all sessions
 */
exports.logout = async (req, res) => {
  try {
    await whatsappService.logout();
    res.json({ success: true, message: 'All sessions logged out. Sessions cleared.' });
  } catch (error) {
    console.error('WhatsApp logout error:', error);
    res.status(500).json({ success: false, message: 'Failed to logout' });
  }
};

// ==========================================
// MESSAGING
// ==========================================

/**
 * POST /api/whatsapp/send-test
 * Send a test message (admin only)
 */
exports.sendTest = async (req, res) => {
  try {
    const { phone, message } = req.body;

    if (!phone || !message) {
      return res.status(400).json({ success: false, message: 'Phone and message are required' });
    }

    const result = await whatsappService.sendMessage(phone, message, {
      type: 'report',
      recipientName: 'Test',
      recipientType: 'admin'
    });

    res.json({ success: true, data: result });
  } catch (error) {
    console.error('WhatsApp test send error:', error);
    res.status(500).json({ success: false, message: 'Failed to send test message' });
  }
};

// ==========================================
// LOGS & STATS
// ==========================================

/**
 * GET /api/whatsapp/logs
 * Get WhatsApp message logs with pagination and filters
 */
exports.getLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50, type, status, startDate, endDate } = req.query;

    const query = {};
    if (type) query.type = type;
    if (status) query.status = status;
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const total = await WhatsAppLog.countDocuments(query);
    const logs = await WhatsAppLog.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('studentId', 'firstName lastName phoneNumber')
      .lean();

    res.json({
      success: true,
      data: logs,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('WhatsApp logs error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch logs' });
  }
};

/**
 * GET /api/whatsapp/stats
 * Get WhatsApp messaging statistics
 */
exports.getStats = async (req, res) => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000);

    const [totalSent, totalFailed, todaySent, recentByType] = await Promise.all([
      WhatsAppLog.countDocuments({ status: 'sent' }),
      WhatsAppLog.countDocuments({ status: 'failed' }),
      WhatsAppLog.countDocuments({ status: 'sent', timestamp: { $gte: today } }),
      WhatsAppLog.aggregate([
        { $match: { timestamp: { $gte: threeDaysAgo } } },
        { $group: { _id: '$type', count: { $sum: 1 }, sent: { $sum: { $cond: [{ $eq: ['$status', 'sent'] }, 1, 0] } } } }
      ])
    ]);

    res.json({
      success: true,
      data: {
        totalSent,
        totalFailed,
        todaySent,
        recentByType,
        connected: whatsappService.isConnected(),
        connectedSessions: whatsappService.multiSession.getConnectedCount()
      }
    });
  } catch (error) {
    console.error('WhatsApp stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
};

// ==========================================
// AI & ANTI-BAN STATUS
// ==========================================

/**
 * GET /api/whatsapp/ai-status
 * Get AI rephrase providers status
 */
exports.getAIStatus = async (req, res) => {
  try {
    const providers = whatsappService.aiRephrase.getProviderStatus();
    res.json({ success: true, data: { providers } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get AI status' });
  }
};

/**
 * GET /api/whatsapp/antiban-status
 * Get anti-ban engine status
 */
exports.getAntiBanStatus = async (req, res) => {
  try {
    const status = whatsappService.antiBan.getEngineStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get anti-ban status' });
  }
};

// ==========================================
// REPORTING
// ==========================================

/**
 * POST /api/whatsapp/generate-report
 * Manually trigger the 3-day report
 */
exports.generateReport = async (req, res) => {
  try {
    await whatsappService.generateAndSendReport();
    res.json({ success: true, message: 'Report generated and sent to admins.' });
  } catch (error) {
    console.error('WhatsApp report error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate report' });
  }
};
