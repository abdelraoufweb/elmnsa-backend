// ==========================================
// THEME ROUTES
// ==========================================

const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const themeController = require('../controllers/themeController');

// Get all available themes
/**
 * GET /api/themes
 */
router.get('/', themeController.listThemes);

// Get user's current theme
/**
 * GET /api/themes/user/:userId
 */
router.get('/user/:userId', authMiddleware, themeController.getUserTheme);

// Apply theme
/**
 * POST /api/themes/apply
 */
router.post('/apply', authMiddleware, themeController.applyTheme);

// Reset theme to default
/**
 * POST /api/themes/reset/:userId
 */
router.post('/reset/:userId', authMiddleware, themeController.resetTheme);

module.exports = router;
