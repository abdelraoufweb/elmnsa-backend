// ==========================================
// ACCESS CODE CONTROLLER
// ==========================================

const AccessCode = require('../models/AccessCode');
const User = require('../models/User');
const SecurityLog = require('../models/SecurityLog');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Hash password using SHA256 with salt (for backward compatibility)
 * @param {string} plainPassword - Plain text password
 * @returns {string} - Hashed password
 */
const hashPassword = (plainPassword) => {
  const salt = process.env.ENCRYPTION_KEY || 'default_salt_change_in_production';
  return crypto
    .createHash('sha256')
    .update(plainPassword + salt)
    .digest('hex');
};

/**
 * Generate JWT token with role and userId
 * @param {string} userId - User ID or identifier
 * @param {string} role - User role
 * @param {string} phoneNumber - User phone (optional)
 * @returns {string} - JWT token
 */
const generateAccessToken = (userId, role, phoneNumber = null) => {
  const payload = {
    id: userId,
    role: role,
    phoneNumber: phoneNumber,
    type: 'access_code_verification'
  };

  return jwt.sign(
    payload,
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
};

/**
 * Log security event
 * @param {object} logData - Log data
 */
const logSecurityEvent = async (logData) => {
  try {
    await SecurityLog.create({
      type: logData.type,
      userId: logData.userId,
      userName: logData.userName,
      userRole: logData.userRole,
      description: logData.description,
      ipAddress: logData.ipAddress,
      severity: logData.severity || 'low',
      createdAt: new Date()
    });
  } catch (error) {
    console.error('Security log error:', error);
  }
};

// ============================================
// PUBLIC ENDPOINTS
// ============================================

/**
 * Verify access code and return JWT token + redirect URL
 * POST /api/access/verify
 *
 * Request body:
 * { accessCode: "string" }
 *
 * Response (success):
 * {
 *   success: true,
 *   message: string,
 *   data: {
 *     token: string,
 *     redirectTo: string,
 *     role: string
 *   }
 * }
 *
 * Response (failure):
 * { success: false, message: "Invalid code" }
 */
exports.verifyAccessCode = async (req, res) => {
  try {
    const { accessCode } = req.body;

    // ✅ Validate input
    if (!accessCode) {
      return res.status(400).json({
        success: false,
        message: 'Access code is required'
      });
    }

    // ✅ Validate type
    if (typeof accessCode !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Access code must be a string'
      });
    }

    // ✅ Find access code in database (EXACT match, no trim)
    const codeRecord = await AccessCode.findOne({
      code: accessCode, // Exact match - no trim due to schema config
      active: true
    });

    if (!codeRecord) {
      // Log failed attempt
      await logSecurityEvent({
        type: 'access_code_invalid_attempt',
        userId: 'anonymous',
        userName: 'Unknown',
        userRole: 'guest',
        description: `Invalid access code attempt: ${accessCode}`,
        ipAddress: req.ip,
        severity: 'medium'
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid or expired access code'
      });
    }

    // ✅ Check if code is expired
    if (codeRecord.expiryDate && new Date(codeRecord.expiryDate) < new Date()) {
      await logSecurityEvent({
        type: 'access_code_expired_attempt',
        userId: 'anonymous',
        userName: 'Unknown',
        userRole: 'guest',
        description: `Expired access code attempt: ${accessCode}`,
        ipAddress: req.ip,
        severity: 'low'
      });

      return res.status(401).json({
        success: false,
        message: 'This access code has expired'
      });
    }

    // ✅ Extract role and redirect from code record
    const role = codeRecord.role;
    const redirectTo = codeRecord.redirectTo || '/dashboard';

    // ✅ Generate unique userId for this access
    // For development: use a generated ID, for production: link to existing user
    const userId = `access_${codeRecord._id}_${Date.now()}`;

    // ✅ Generate JWT token with role and userId
    const token = generateAccessToken(userId, role);

    // ✅ Log successful access
    await logSecurityEvent({
      type: 'access_code_verified',
      userId: userId,
      userName: `${role.toUpperCase()} via code`,
      userRole: role,
      description: `Access granted via code type: ${codeRecord.type}`,
      ipAddress: req.ip,
      severity: 'low'
    });

    // ✅ Update usage tracking (optional)
    if (codeRecord.maxUsers || codeRecord.maxViewsPerUser) {
      codeRecord.currentUsers = (codeRecord.currentUsers || 0) + 1;
      await codeRecord.save();
    }
    // ✅ Return success response with token and redirect URL
    return res.status(200).json({
      success: true,
      message: `Access granted as ${role}`,
      data: {
        token: token,
        redirectTo: redirectTo,
        role: role
      }
    });

  } catch (error) {
    console.error('Access code verification error:', error);
    return res.status(500).json({
      success: false,
      message: 'Access code verification failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Validate token (optional - for frontend to verify token is still valid)
 * POST /api/access/validate-token
 * 
 * Request headers: Authorization: Bearer TOKEN
 * 
 * Response:
 * { success: true, role: "student", userId: "..." }
 * { success: false, message: "Invalid or expired token" }
 */
exports.validateToken = async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    // Verify JWT
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    return res.status(200).json({
      success: true,
      role: decoded.role,
      userId: decoded.id,
      phoneNumber: decoded.phoneNumber
    });

  } catch (error) {
    console.error('Token validation error:', error);
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token'
    });
  }
};

/**
 * Create new access code (Admin/Developer only)
 * POST /api/access/create
 * 
 * Request body:
 * {
 *   code: "PARENT123",
 *   type: "parent|student|admin|developer|assistant|video|ai",
 *   role: "parent|student|admin|developer|assistant|teacher",
 *   redirectTo: "/parent-dashboard",
 *   expiryDate: "2025-12-31T23:59:59Z",
 *   maxUsers: 100
 * }
 */
exports.createAccessCode = async (req, res) => {
  try {
    // ✅ Authorization - admin/developer only
    if (!req.user || !['admin', 'developer'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin or developer can create access codes'
      });
    }

    const {
      code,
      type,
      role,
      redirectTo = '/dashboard',
      expiryDate,
      maxUsers
    } = req.body;

    // ✅ Validation
    if (!code || !type || !role) {
      return res.status(400).json({
        success: false,
        message: 'code, type, and role are required'
      });
    }

    // ✅ Check if code already exists
    const existingCode = await AccessCode.findOne({ code });
    if (existingCode) {
      return res.status(409).json({
        success: false,
        message: 'This access code already exists'
      });
    }

    // ✅ Create new access code
    const newCode = new AccessCode({
      code,
      type,
      role,
      redirectTo,
      expiryDate: expiryDate ? new Date(expiryDate) : undefined,
      maxUsers: maxUsers || undefined,
      active: true,
      createdBy: req.user._id,
      createdAt: new Date()
    });

    await newCode.save();

    // ✅ Log creation
    await logSecurityEvent({
      type: 'access_code_created',
      userId: req.user._id,
      userName: req.user.firstName + ' ' + req.user.lastName,
      userRole: req.user.role,
      description: `Created access code: ${code} (${type}/${role})`,
      ipAddress: req.ip,
      severity: 'low'
    });

    return res.status(201).json({
      success: true,
      message: 'Access code created successfully',
      data: newCode
    });

  } catch (error) {
    console.error('Create access code error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create access code',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get all access codes (Admin/Developer only)
 * GET /api/access/codes?type=parent&active=true
 */
exports.getAccessCodes = async (req, res) => {
  try {
    // ✅ Authorization
    if (!req.user || !['admin', 'developer'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin or developer can view access codes'
      });
    }

    const { type, active = true, page = 1, limit = 20 } = req.query;

    // Build query
    const query = {};
    if (type) query.type = type;
    if (active !== undefined) query.active = active === 'true';

    // Pagination
    const skip = (page - 1) * limit;

    const codes = await AccessCode.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('createdBy', 'firstName lastName');

    const total = await AccessCode.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: codes,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get access codes error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch access codes'
    });
  }
};

/**
 * Disable access code (Admin/Developer only)
 * PATCH /api/access/codes/:codeId/disable
 */
exports.disableAccessCode = async (req, res) => {
  try {
    // ✅ Authorization
    if (!req.user || !['admin', 'developer'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin or developer can disable access codes'
      });
    }

    const { codeId } = req.params;

    // Find and update code
    const code = await AccessCode.findByIdAndUpdate(
      codeId,
      { active: false },
      { new: true }
    );

    if (!code) {
      return res.status(404).json({
        success: false,
        message: 'Access code not found'
      });
    }

    // Log action
    await logSecurityEvent({
      type: 'access_code_disabled',
      userId: req.user._id,
      userName: req.user.firstName + ' ' + req.user.lastName,
      userRole: req.user.role,
      description: `Disabled access code: ${code.code}`,
      ipAddress: req.ip,
      severity: 'low'
    });

    return res.status(200).json({
      success: true,
      message: 'Access code disabled',
      data: code
    });

  } catch (error) {
    console.error('Disable access code error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to disable access code'
    });
  }
};

/**
 * Create test access code (Development only)
 * Used for testing the verification flow
 */
exports.createTestAccessCode = async (req, res) => {
  try {
    // Allow only in development or when a dedicated feature flag is enabled
    const allowTestCodes = process.env.NODE_ENV === 'development' || process.env.ENABLE_TEST_ACCESS_CODES === 'true';
    if (!allowTestCodes) {
      return res.status(403).json({ success: false, message: 'Test access codes are disabled' });
    }

    // Require an authenticated admin/developer identity to create even in development
    if (!req.user || !['admin', 'developer'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Only admin or developer can create test access codes' });
    }

    const { code = 'TEST123', type = 'student', role = 'student', redirectTo = '/dashboard' } = req.body;

    // Prevent creation of privileged roles via this endpoint
    const forbiddenRoles = ['admin', 'developer'];
    if (forbiddenRoles.includes(role)) {
      return res.status(400).json({ success: false, message: 'Creating privileged roles is not allowed via this endpoint' });
    }

    // Check if code already exists
    const existing = await AccessCode.findOne({ code });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'Access code already exists'
      });
    }

    // Create new access code
    const newCode = new AccessCode({
      code,
      type,
      role,
      redirectTo,
      active: true,
      expiryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    });

    await newCode.save();

    return res.status(201).json({
      success: true,
      message: 'Test access code created',
      data: {
        code: newCode.code,
        type: newCode.type,
        role: newCode.role,
        redirectTo: newCode.redirectTo
      }
    });

  } catch (error) {
    console.error('Create test code error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create test access code',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};
