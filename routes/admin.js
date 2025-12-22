// ==========================================
// ADMIN ROUTES
// ==========================================

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authMiddleware, authorize } = require('../middleware/auth');

// All admin routes require authentication and admin/developer role

/**
 * @route   GET /api/admin/dashboard
 * @desc    Get dashboard statistics
 * @access  Private (Admin, Developer)
 */
router.get('/dashboard', authMiddleware, authorize(['admin', 'developer']), adminController.getDashboard);

/**
 * @route   GET /api/admin/logs
 * @desc    Get security logs with filtering
 * @query   type - filter by log type (login, logout, registration, account_approved, etc)
 * @query   days - number of days to go back (default: 7)
 * @query   page - page number (default: 1)
 * @query   limit - items per page (default: 20)
 * @access  Private (Admin, Developer)
 */
router.get('/logs', authMiddleware, authorize(['admin', 'developer']), adminController.getSecurityLogs);

/**
 * @route   GET /api/admin/pending-accounts
 * @desc    Get all pending user accounts awaiting approval
 * @access  Private (Admin, Developer)
 */
router.get('/pending-accounts', authMiddleware, authorize(['admin', 'developer']), adminController.getPendingAccounts);

/**
 * @route   POST /api/admin/approve-account
 * @desc    Approve a user account
 * @body    userId - user ID to approve
 * @access  Private (Admin, Developer)
 */
router.post('/approve-account', authMiddleware, authorize(['admin', 'developer']), adminController.approveAccount);

/**
 * @route   POST /api/admin/block-user
 * @desc    Block a user account
 * @body    userId - user ID to block
 * @body    reason - reason for blocking (optional)
 * @access  Private (Admin, Developer)
 */
router.post('/block-user', authMiddleware, authorize(['admin', 'developer']), adminController.blockUser);

/**
 * @route   POST /api/admin/unblock-user
 * @desc    Unblock a user account
 * @body    userId - user ID to unblock
 * @access  Private (Admin, Developer)
 */
router.post('/unblock-user', authMiddleware, authorize(['admin', 'developer']), adminController.unblockUser);

module.exports = router;
