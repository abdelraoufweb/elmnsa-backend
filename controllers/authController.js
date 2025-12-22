// ==========================================
// AUTHENTICATION CONTROLLER
// ==========================================

const User = require('../models/User');
const AccessCode = require('../models/AccessCode');
const SecurityLog = require('../models/SecurityLog');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Hash password using bcrypt
 * @param {string} plainPassword - Plain text password
 * @returns {Promise<string>} - Hashed password
 */
const hashPassword = async (plainPassword) => {
  const saltRounds = parseInt(process.env.BCRYPT_ROUNDS || 10);
  return await bcrypt.hash(plainPassword, saltRounds);
};

/**
 * Verify password
 * @param {string} plainPassword - Plain text input
 * @param {string} hashedPassword - Stored hash
 * @returns {Promise<boolean>}
 */
const verifyPassword = async (plainPassword, hashedPassword) => {
  return await bcrypt.compare(plainPassword, hashedPassword);
};

/**
 * Generate JWT token
 * @param {object} user - User object
 * @returns {string} - JWT token
 */
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      phoneNumber: user.phoneNumber,
      role: user.role,
      firstName: user.firstName
    },
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
 * Register new student
 * POST /api/auth/register
 */
exports.register = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      middleName,
      phoneNumber,
      parentPhone,
      password,
      grade,
      curriculum,
      schoolName
    } = req.body;

    // Validation
    if (!firstName || !lastName || !phoneNumber || !password) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
        errors: {
          firstName: !firstName ? 'Required' : null,
          lastName: !lastName ? 'Required' : null,
          phoneNumber: !phoneNumber ? 'Required' : null,
          password: !password ? 'Required' : null
        }
      });
    }

    // Check phone format (Egyptian phone: 201XXXXXXXXX)
    const phoneRegex = /^20[0-9]{10}$/;
    if (!phoneRegex.test(phoneNumber)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format',
        errors: { phoneNumber: 'Must be valid Egyptian phone' }
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ phoneNumber });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Phone number already registered',
        error: 'DUPLICATE_PHONE'
      });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const user = new User({
      firstName,
      lastName,
      middleName: middleName || null,
      phoneNumber,
      parentPhone: parentPhone || null,
      password: hashedPassword,
      role: 'student',
      status: 'pending',
      grade: grade || null,
      curriculum: curriculum || null,
      schoolName: schoolName || null,
      registeredAt: new Date()
    });

    await user.save();

    // Log registration
    await logSecurityEvent({
      type: 'student_registered',
      userId: user._id,
      userName: `${firstName} ${lastName}`,
      userRole: 'student',
      description: `New student registered: ${firstName} ${lastName}`,
      ipAddress: req.ip,
      severity: 'low'
    });

    // Generate token
    const token = generateToken(user);

    res.status(201).json({
      success: true,
      message: 'Student registered successfully',
      data: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        role: user.role,
        status: user.status,
        grade: user.grade
      },
      token
    });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed',
      error: error.message
    });
  }
};

/**
 * Login user
 * POST /api/auth/login
 */
exports.login = async (req, res) => {
  try {
    const { phoneNumber, password } = req.body;

    // Validation
    if (!phoneNumber || !password) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and password required'
      });
    }

    // Find user
    const user = await User.findOne({ phoneNumber });
    if (!user) {
      // Log failed attempt
      await logSecurityEvent({
        type: 'failed_login',
        description: `Failed login attempt: user not found`,
        ipAddress: req.ip,
        severity: 'medium'
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if account is blocked
    if (user.status === 'blocked') {
      await logSecurityEvent({
        type: 'blocked_login_attempt',
        userId: user._id,
        userName: `${user.firstName} ${user.lastName}`,
        userRole: user.role,
        description: `Blocked user attempted login`,
        ipAddress: req.ip,
        severity: 'high'
      });

      return res.status(403).json({
        success: false,
        message: 'Account is blocked',
        error: 'ACCOUNT_BLOCKED'
      });
    }

    // Verify password
    if (!(await verifyPassword(password, user.password))) {
      await logSecurityEvent({
        type: 'failed_login',
        userId: user._id,
        userName: `${user.firstName} ${user.lastName}`,
        userRole: user.role,
        description: 'Failed login: wrong password',
        ipAddress: req.ip,
        severity: 'medium'
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Device management for students
    let deviceStatus = null;
    let isNewDevice = false;
    let requiresApproval = false;

    if (user.role === 'student') {
      const crypto = require('crypto');
      const userAgent = req.headers['user-agent'] || '';
      const clientIp = req.ip || req.connection.remoteAddress || '';
      
      // Generate device fingerprint
      const deviceFingerprint = crypto
        .createHash('sha256')
        .update(`${userAgent}${clientIp}`)
        .digest('hex');

      // Check if device is already approved
      const approvedDevice = user.approvedDevices?.find(d => d.deviceId === deviceFingerprint);
      
      if (!approvedDevice) {
        // New device detected
        isNewDevice = true;
        requiresApproval = user.requireDeviceApproval !== false;

        if (requiresApproval) {
          // Add to pending approval
          if (!user.approvedDevices) {
            user.approvedDevices = [];
          }

          // Check if this device is already pending
          const pendingDevice = user.approvedDevices.find(
            d => d.deviceId === deviceFingerprint && !d.approvedAt
          );

          if (!pendingDevice) {
            user.approvedDevices.push({
              deviceId: deviceFingerprint,
              deviceName: `Device - ${new Date().toLocaleDateString()}`,
              phoneNumber: user.phoneNumber,
              lastUsedAt: new Date()
            });
          } else {
            // Update last used time
            pendingDevice.lastUsedAt = new Date();
          }

          deviceStatus = 'pending_approval';
        } else {
          // Auto-approve new devices (for non-strict mode)
          user.approvedDevices.push({
            deviceId: deviceFingerprint,
            deviceName: `Device - ${new Date().toLocaleDateString()}`,
            phoneNumber: user.phoneNumber,
            approvedAt: new Date(),
            approvedBy: 'auto',
            lastUsedAt: new Date()
          });

          deviceStatus = 'approved';
        }
      } else {
        // Known device - update last used time
        approvedDevice.lastUsedAt = new Date();
        deviceStatus = 'approved';
      }

      // Set current device ID
      user.currentDeviceId = deviceFingerprint;
    }

    // Update last login
    user.lastLoginAt = new Date();
    await user.save();

    // Log successful login
    await logSecurityEvent({
      type: 'login',
      userId: user._id,
      userName: `${user.firstName} ${user.lastName}`,
      userRole: user.role,
      description: `User logged in${isNewDevice ? ' (new device)' : ''}`,
      ipAddress: req.ip,
      severity: 'low'
    });

    // Generate token
    const token = generateToken(user);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        middleName: user.middleName,
        phoneNumber: user.phoneNumber,
        role: user.role,
        status: user.status,
        grade: user.grade,
        curriculum: user.curriculum,
        schoolName: user.schoolName,
        lastLoginAt: user.lastLoginAt,
        // Device info for students
        ...(user.role === 'student' && {
          deviceStatus,
          isNewDevice,
          requiresApproval
        })
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error.message
    });
  }
};

/**
 * Verify access code
 * POST /api/auth/verify-access-code
 * Codes must match EXACTLY (no trim, case-sensitive)
 */
exports.verifyAccessCode = async (req, res) => {
  try {
    const { code, codeType } = req.body;

    // Validation
    if (!code || !codeType) {
      return res.status(400).json({
        success: false,
        message: 'Code and type required'
      });
    }

    // Find access code (EXACT match, no trim)
    const accessCode = await AccessCode.findOne({
      code: code,  // Exact match, case-sensitive
      type: codeType,
      active: true
    });

    if (!accessCode) {
      await logSecurityEvent({
        type: 'invalid_access_code',
        description: `Invalid or expired code attempt: ${codeType}`,
        ipAddress: req.ip,
        severity: 'medium'
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid or expired access code'
      });
    }

    // Check expiry
    if (accessCode.expiryDate && new Date() > accessCode.expiryDate) {
      return res.status(401).json({
        success: false,
        message: 'Access code has expired'
      });
    }

    // Check user limit
    if (accessCode.maxUsers && accessCode.currentUsers >= accessCode.maxUsers) {
      return res.status(429).json({
        success: false,
        message: 'Access code capacity reached'
      });
    }

    // Log successful code use
    await logSecurityEvent({
      type: 'access_code_verified',
      description: `Access code verified: ${codeType}`,
      ipAddress: req.ip,
      severity: 'low'
    });

    res.status(200).json({
      success: true,
      message: 'Access code verified',
      data: {
        valid: true,
        accessType: codeType,
        expiryDate: accessCode.expiryDate,
        remainingUsers: accessCode.maxUsers
          ? accessCode.maxUsers - accessCode.currentUsers
          : null
      }
    });
  } catch (error) {
    console.error('Verify code error:', error);
    res.status(500).json({
      success: false,
      message: 'Code verification failed',
      error: error.message
    });
  }
};

/**
 * Get current user info
 * GET /api/auth/me
 * Requires: JWT token
 */
exports.getCurrentUser = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    const user = await User.findById(req.user.id).select('-password');

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user info',
      error: error.message
    });
  }
};

/**
 * Refresh JWT token
 * POST /api/auth/refresh-token
 */
exports.refreshToken = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const newToken = generateToken(user);

    res.status(200).json({
      success: true,
      message: 'Token refreshed',
      token: newToken
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({
      success: false,
      message: 'Token refresh failed',
      error: error.message
    });
  }
};

/**
 * Logout user
 * POST /api/auth/logout
 */
exports.logout = async (req, res) => {
  try {
    if (req.user) {
      await logSecurityEvent({
        type: 'logout',
        userId: req.user.id,
        userRole: req.user.role,
        description: 'User logged out',
        ipAddress: req.ip,
        severity: 'low'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed',
      error: error.message
    });
  }
};

/**
 * Health check endpoint
 * GET /api/auth/health
 */
exports.healthCheck = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      message: 'Server is running',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Health check failed'
    });
  }
};
