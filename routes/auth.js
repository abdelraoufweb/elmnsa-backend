// ==========================================
// AUTHENTICATION ROUTES
// ==========================================

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authMiddleware, authorize } = require('../middleware/auth');
const { verifyCaptcha } = require('../middleware/captcha');

// Public Routes (No authentication required)

/**
 * Register new student
 * POST /api/auth/register
 */
// ✅ CAPTCHA applied: prevents automated mass registration
router.post('/register', verifyCaptcha, authController.register);

/**
 * Login
 * POST /api/auth/login
 */
// ✅ CAPTCHA applied: blocks automated brute-force login attacks
router.post('/login', verifyCaptcha, authController.login);

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

// ==========================================
// PASSWORD RESET & COMBINATION LOCK ROUTES
// ==========================================

/**
 * Request password reset (sends OTP via WhatsApp)
 * POST /api/auth/request-password-reset
 */
// ✅ CAPTCHA applied: prevents automated password reset enumeration
router.post('/request-password-reset', verifyCaptcha, authController.requestPasswordReset);

/**
 * Verify OTP for password reset
 * POST /api/auth/verify-reset-otp
 */
router.post('/verify-reset-otp', authController.verifyResetOtp);

/**
 * Fallback verification (parent phone + full name)
 * POST /api/auth/verify-reset-fallback
 */
router.post('/verify-reset-fallback', authController.verifyResetFallback);

/**
 * Reset password with reset token
 * POST /api/auth/reset-password
 */
router.post('/reset-password', authController.resetPassword);

/**
 * Setup combination lock code (requires auth)
 * POST /api/auth/setup-lock
 */
router.post('/setup-lock', authMiddleware, authController.setupLockCode);

/**
 * Login with combination lock code (public)
 * POST /api/auth/login-with-lock
 */
router.post('/login-with-lock', authController.loginWithLock);

module.exports = router;
