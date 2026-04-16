// ==========================================
// AUTHENTICATION ROUTES
// ==========================================

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController.fixed');
const { authMiddleware, authorize } = require('../middleware/auth');

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

/**
 * Logout
 * POST /api/auth/logout
 */
router.post('/logout', authMiddleware, authController.logout);

// Admin Routes - Get users data for dashboard

/**
 * Get pending users (for approval)
 * GET /api/auth/pending-users
 */
router.get('/pending-users', authMiddleware, authorize(['admin', 'assistant', 'developer']), authController.getPendingUsers);

/**
 * Get all users
 * GET /api/auth/all-users
 */
router.get('/all-users', authMiddleware, authorize(['admin', 'assistant', 'developer']), authController.getAllUsers);

/**
 * Get blocked users
 * GET /api/auth/blocked-users
 */
router.get('/blocked-users', authMiddleware, authorize(['admin', 'assistant', 'developer']), authController.getBlockedUsers);

/**
 * Get approved users
 * GET /api/auth/approved-users
 */
router.get('/approved-users', authMiddleware, authorize(['admin', 'assistant', 'developer']), authController.getApprovedUsers);


/**
 * Get current user status
 * GET /api/auth/status
 */
router.get('/status', authMiddleware, authController.getUserStatus);

module.exports = router;
