// ==========================================
// AUTHENTICATION ROUTES
// ==========================================

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth');

// Public Routes (No authentication required)

/**
 * Register new student
 * POST /api/auth/register
 */
router.post('/register', authController.register);

/**
 * Login
 * POST /api/auth/login
 */
router.post('/login', authController.login);

/**
 * Verify access code
 * POST /api/auth/verify-access-code
 */
router.post('/verify-access-code', authController.verifyAccessCode);

/**
 * Health check
 * GET /api/auth/health
 */
router.get('/health', authController.healthCheck);

// Protected Routes (Requires authentication)

/**
 * Get current user
 * GET /api/auth/me
 */
router.get('/me', authMiddleware, authController.getCurrentUser);

/**
 * Refresh token
 * POST /api/auth/refresh-token
 */
router.post('/refresh-token', authMiddleware, authController.refreshToken);

module.exports = router;
