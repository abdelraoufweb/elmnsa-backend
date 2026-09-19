// ==========================================
// WHATSAPP API ROUTES v2
// ==========================================
// Multi-session management routes.
// All routes require admin or developer role.

const express = require('express');
const router = express.Router();
const whatsappController = require('../controllers/whatsappController');
const { authMiddleware } = require('../middleware/auth');

// Middleware: require admin, developer or assistant role
const requireAdmin = (req, res, next) => {
  if (!req.user || !['admin', 'developer', 'assistant'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Admin, Developer or Assistant access required' });
  }
  next();
};

// All routes require authentication + admin role
router.use(authMiddleware);
router.use(requireAdmin);

// ── System Status ───────────────────────────
router.get('/status', whatsappController.getStatus);
router.get('/test-puppeteer', async (req, res) => {
  const { exec } = require('child_process');
  const chromePath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_BIN || '/usr/bin/chromium';
  exec(`${chromePath} --version`, (err, stdout, stderr) => {
    res.json({
      executablePath: chromePath,
      err: err ? err.message : null,
      stdout: stdout ? stdout.trim() : '',
      stderr: stderr ? stderr.trim() : '',
      env: {
        PUPPETEER_SKIP_CHROMIUM_DOWNLOAD: process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD || null,
        PUPPETEER_EXECUTABLE_PATH: process.env.PUPPETEER_EXECUTABLE_PATH || null,
        CHROME_BIN: process.env.CHROME_BIN || null
      }
    });
  });
});

// ── Session Management (NEW) ────────────────
router.get('/sessions', whatsappController.getSessions);
router.post('/sessions', whatsappController.createSession);
router.post('/sessions/:sessionId/connect', whatsappController.connectSession);
router.post('/sessions/:sessionId/disconnect', whatsappController.disconnectSession);
router.post('/sessions/:sessionId/logout', whatsappController.logoutSession);
router.delete('/sessions/:sessionId', whatsappController.removeSession);

// ── Legacy Connection (backward compat) ─────
router.post('/connect', whatsappController.connect);
router.post('/disconnect', whatsappController.disconnect);
router.post('/logout', whatsappController.logout);

// ── Messaging ───────────────────────────────
router.post('/send-test', whatsappController.sendTest);

// ── Logs & Stats ────────────────────────────
router.get('/logs', whatsappController.getLogs);
router.get('/stats', whatsappController.getStats);

// ── AI & Anti-Ban Status (NEW) ──────────────
router.get('/ai-status', whatsappController.getAIStatus);
router.get('/antiban-status', whatsappController.getAntiBanStatus);

// ── Reporting ───────────────────────────────
router.post('/generate-report', whatsappController.generateReport);

module.exports = router;
