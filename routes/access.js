// ==========================================
// ACCESS CODE ROUTES
// ==========================================

const express = require('express');
const router = express.Router();
const accessController = require('../controllers/accessController');
const { authMiddleware, authorize } = require('../middleware/auth');

// ============================================
// PUBLIC ENDPOINTS (No authentication required)
// ============================================

/**
 * Verify access code and get JWT token
 * POST /api/access/verify
 * Public endpoint - anyone can verify a code
 * 
 * Body: { accessCode: "PARENT123" }
 * Response: { success: true, token: "JWT", redirectTo: "/parent-dashboard" }
 */
router.post('/verify', accessController.verifyAccessCode);

/**
 * Validate JWT token (optional - for frontend token verification)
 * POST /api/access/validate-token
 * Public endpoint - anyone can validate their own token
 * 
 * Headers: Authorization: Bearer JWT_TOKEN
 * Response: { success: true, role: "parent", userId: "..." }
 */
router.post('/validate-token', accessController.validateToken);

// ============================================
// PROTECTED ENDPOINTS (Admin/Developer only)
// ============================================

/**
 * Create new access code
 * POST /api/access/codes
 * Protected - admin/developer only
 * 
 * Body: {
 *   code: "PARENT123",
 *   type: "parent",
 *   role: "parent",
 *   redirectTo: "/parent-dashboard",
 *   expiryDate: "2025-12-31T23:59:59Z",
 *   maxUsers: 100
 * }
 */
router.post('/codes', authMiddleware, accessController.createAccessCode);

/**
 * Get all access codes with filtering
 * GET /api/access/codes?type=parent&active=true&page=1&limit=20
 * Protected - admin/developer only
 */
router.get('/codes', authMiddleware, accessController.getAccessCodes);

/**
 * Disable access code
 * PATCH /api/access/codes/:codeId/disable
 * Protected - admin/developer only
 */
router.patch('/codes/:codeId/disable', authMiddleware, accessController.disableAccessCode);

module.exports = router;
