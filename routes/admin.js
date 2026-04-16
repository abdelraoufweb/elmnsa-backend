// ==========================================
// ADMIN ROUTES
// ==========================================

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authMiddleware, authorize } = require('../middleware/auth');

// All admin routes require authentication and appropriate admin/developer roles

/**
 * @route   GET /api/admin/dashboard
 * @desc    Get dashboard statistics
 * @access  Private (Admin, Developer)
 */
router.get('/dashboard', authMiddleware, authorize(['admin', 'developer', 'assistant']), adminController.getDashboard);
router.get('/logs', authMiddleware, authorize(['admin', 'developer', 'assistant']), adminController.getSecurityLogs);
router.get('/students', authMiddleware, authorize(['admin', 'developer', 'assistant']), adminController.getAllStudents);
router.get('/pending-accounts', authMiddleware, authorize(['admin', 'developer', 'assistant']), adminController.getPendingAccounts);

/**
 * @route   POST /api/admin/approve-account
 * @desc    Approve a user account
 * @body    userId - user ID to approve
 * @access  Private (Admin, Developer)
 */
router.post('/approve-account', authMiddleware, authorize(['admin', 'developer', 'assistant']), adminController.approveAccount);

/**
 * @route   POST /api/admin/reject-account
 * @desc    Reject a user account
 * @body    userId - user ID to reject
 * @access  Private (Admin, Developer)
 */
router.post('/reject-account', authMiddleware, authorize(['admin', 'developer', 'assistant']), adminController.rejectAccount);

/**
 * @route   POST /api/admin/block-user
 * @desc    Block a user account
 * @body    userId - user ID to block
 * @body    reason - reason for blocking (optional)
 * @access  Private (Admin, Developer)
 */
router.post('/block-user', authMiddleware, authorize(['admin', 'developer', 'assistant']), adminController.blockUser);

/**
 * @route   POST /api/admin/unblock-user
 * @desc    Unblock a user account
 * @body    userId - user ID to unblock
 * @access  Private (Admin, Developer)
 */
router.post('/unblock-user', authMiddleware, authorize(['admin', 'developer', 'assistant']), adminController.unblockUser);

/**
 * @route   POST /api/admin/suspend-user
 * @desc    Suspend a user account (temporary)
 * @body    userId - user ID to suspend
 * @body    reason - reason for suspension (optional)
 * @access  Private (Admin, Developer)
 */
router.post('/suspend-user', authMiddleware, authorize(['admin', 'developer', 'assistant']), adminController.suspendUser);

/**
 * @route   POST /api/admin/unsuspend-user
 * @desc    Unsuspend a user account (resume)
 * @body    userId - user ID to unsuspend
 * @access  Private (Admin, Developer)
 */
router.post('/unsuspend-user', authMiddleware, authorize(['admin', 'developer', 'assistant']), adminController.unsuspendUser);

/**
 * @route   POST /api/admin/delete-user
 * @desc    Delete a user account permanently
 * @body    userId - user ID to delete
 * @access  Private (Admin, Developer)
 */
router.post('/delete-user', authMiddleware, authorize(['admin', 'developer', 'assistant']), adminController.deleteUser);

module.exports = router;
