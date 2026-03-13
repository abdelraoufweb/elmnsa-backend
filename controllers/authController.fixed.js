; const User = require('../models/User');
const AccessCode = require('../models/AccessCode');
const SecurityLog = require('../models/SecurityLog');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Validate password strength
 * @param {string} password 
 * @returns {object} { valid: boolean, message: string }
 */
const validatePasswordStrength = (password) => {
  if (password.length < 8) return { valid: false, message: 'Password must be at least 8 characters long' };
  if (!/[A-Z]/.test(password)) return { valid: false, message: 'Password must contain at least one uppercase letter' };
  if (!/[a-z]/.test(password)) return { valid: false, message: 'Password must contain at least one lowercase letter' };
  if (!/[0-9]/.test(password)) return { valid: false, message: 'Password must contain at least one number' };
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) return { valid: false, message: 'Password must contain at least one special character' };
  return { valid: true };
};

/**
 * Hash password using bcrypt
 * @param {string} plainPassword - Plain text password
 * @returns {Promise<string>} - Hashed password
 */
const hashPassword = async (plainPassword) => {
  const saltRounds = parseInt(process.env.BCRYPT_ROUNDS || '10', 10);
  const rounds = Number.isInteger(saltRounds) && saltRounds > 0 ? saltRounds : 10;
  return await bcrypt.hash(plainPassword, rounds);
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
  if (!process.env.JWT_SECRET) {
    throw new Error('Missing JWT_SECRET');
  }
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
 * Generate JWT token for access code verification
 * @param {string} userId - User ID or identifier
 * @param {string} role - User role (student, parent, admin)
 * @param {string} phoneNumber - User phone (optional)
 * @returns {string} - JWT token
 */
const generateAccessToken = (userId, role, phoneNumber = null) => {
  return jwt.sign(
    {
      id: userId,
      role: role,
      phoneNumber: phoneNumber,
      type: 'access_code_verification'
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
      type: logData.type || 'unknown',
      userId: logData.userId || null,
      userName: logData.userName || 'anonymous',
      userRole: logData.userRole || 'guest',
      description: logData.description || '',
      message: logData.description || logData.message || 'Security event logged',
      ipAddress: logData.ipAddress || '0.0.0.0',
      severity: logData.severity || 'info',
      createdAt: new Date()
    });
  } catch (error) {
    console.error('Security log error:', error.message);
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

    // Check phone format (Egyptian phone: 11 digits starting with 010, 011, 012, or 015)
    const digitsOnly = phoneNumber.replace(/\D/g, '');
    const phoneRegex = /^(010|011|012|015)[0-9]{8}$/;
    if (!phoneRegex.test(digitsOnly) || digitsOnly.length !== 11) {
      return res.status(400).json({
        success: false,
        message: 'Invalid phone number format',
        errors: { phoneNumber: 'Must be 11 digits starting with 010, 011, 012, or 015' }
      });
    }

    // Enforce Password Strength
    const passwordCheck = validatePasswordStrength(password);
    if (!passwordCheck.valid) {
      return res.status(400).json({
        success: false,
        message: passwordCheck.message,
        errors: { password: passwordCheck.message }
      });
    }

    // Normalize phone to digits only for storage
    const normalizedPhone = digitsOnly;

    // Check if user already exists
    const existingUser = await User.findOne({ phoneNumber: normalizedPhone });
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
      phoneNumber: normalizedPhone,
      parentPhone: parentPhone || null,
      password: hashedPassword,
      role: 'student',
      status: 'pending',
      grade: grade || null,
      curriculum: curriculum || undefined, // Don't set if not provided
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
      severity: 'info'
    });

    // ✅ Don't generate token - user must wait for admin approval
    res.status(201).json({
      success: true,
      message: 'Registration successful! Please wait for admin approval.',
      data: {
        id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
        role: user.role,
        status: user.status,
        grade: user.grade
      }
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

    // Normalize phone to digits only
    const normalizedPhone = phoneNumber.replace(/\D/g, '');

    // Find user - MUST include password with select()
    const user = await User.findOne({ phoneNumber: normalizedPhone }).select('+password');
    if (!user) {
      // Log failed attempt
      await logSecurityEvent({
        type: 'failed_login',
        description: `Failed login attempt: user not found`,
        ipAddress: req.ip,
        severity: 'warning'
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Verify password FIRST - before checking status
    if (!user.password) {
      console.error('❌ User has no password:', user._id);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    let passwordMatch = false;
    try {
      passwordMatch = await verifyPassword(password, user.password);
    } catch (bcryptError) {
      console.error('❌ Bcrypt error:', bcryptError.message);
      console.error('   Password type:', typeof user.password);
      console.error('   Password length:', user.password?.length);
      return res.status(500).json({
        success: false,
        message: 'Login verification failed'
      });
    }

    if (!passwordMatch) {
      await logSecurityEvent({
        type: 'failed_login',
        userId: user._id,
        userName: `${user.firstName} ${user.lastName}`,
        userRole: user.role,
        description: 'Failed login: wrong password',
        ipAddress: req.ip,
        severity: 'warning'
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // ✅ Now check account status AFTER password verification
    if (user.status === 'pending') {
      await logSecurityEvent({
        type: 'pending_account_login_attempt',
        userId: user._id,
        userName: `${user.firstName} ${user.lastName}`,
        userRole: user.role,
        description: `Pending account user attempted login`,
        ipAddress: req.ip,
        severity: 'info'
      });

      return res.status(403).json({
        success: false,
        message: 'Your account is pending admin approval',
        error: 'ACCOUNT_PENDING',
        status: user.status
      });
    }

    // ✅ Check if account is BLOCKED (permanent block)
    if (user.status === 'blocked') {
      await logSecurityEvent({
        type: 'blocked_login_attempt',
        userId: user._id,
        userName: `${user.firstName} ${user.lastName}`,
        userRole: user.role,
        description: `BLOCKED account user attempted login`,
        ipAddress: req.ip,
        severity: 'error'
      });

      return res.status(403).json({
        success: false,
        message: 'Your account has been permanently blocked',
        error: 'ACCOUNT_BLOCKED',
        reason: user.blockedReason || 'Your account has been permanently blocked',
        blockedAt: user.blockedAt
      });
    }

    // ✅ Check if account is SUSPENDED (temporary suspension)
    if (user.status === 'suspended') {
      await logSecurityEvent({
        type: 'suspended_login_attempt',
        userId: user._id,
        userName: `${user.firstName} ${user.lastName}`,
        userRole: user.role,
        description: `SUSPENDED account user attempted login`,
        ipAddress: req.ip,
        severity: 'warning'
      });

      return res.status(403).json({
        success: false,
        message: 'Your account has been temporarily suspended',
        error: 'ACCOUNT_SUSPENDED',
        reason: user.suspensionReason || 'Your account has been temporarily suspended',
        suspendedAt: user.suspendedAt
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
      const acceptLang = req.headers['accept-language'] || '';

      // Allow client to supply a deviceId (header or body) for better persistence across IP changes
      const clientProvidedDeviceId = req.body?.deviceId || req.headers['x-device-id'] || null;

      // Generate device fingerprint (or use client-provided id)
      const deviceFingerprint = clientProvidedDeviceId || crypto
        .createHash('sha256')
        .update(`${userAgent}${clientIp}${acceptLang}`)
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

          user.currentDeviceId = deviceFingerprint;
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
        // Device already approved
        approvedDevice.lastUsedAt = new Date();
        deviceStatus = 'approved';
      }

      await user.save();
    }

    if (deviceStatus === 'pending_approval') {
      return res.status(403).json({
        success: false,
        message: 'Your device is pending approval. Please wait for an administrator to approve it.',
        error: 'DEVICE_PENDING_APPROVAL',
        requiresApproval: true
      });
    }

    // Log successful login
    await logSecurityEvent({
      type: 'login_success',
      userId: user._id,
      userName: `${user.firstName} ${user.lastName}`,
      userRole: user.role,
      description: `User logged in successfully`,
      ipAddress: req.ip,
      severity: 'info'
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
        phoneNumber: user.phoneNumber,
        role: user.role,
        status: user.status,
        grade: user.grade,
        deviceStatus,
        isNewDevice,
        requiresApproval
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
 * Verify access code (ADMIN/DEVELOPER/ASSISTANT only)
 * POST /api/auth/verify-access-code
 * Codes must match EXACTLY (no trim, case-sensitive)
 */
exports.verifyAccessCode = async (req, res) => {
  try {
    // 🎯 FIXED: Support both 'code' and 'accessCode' keys from frontend
    const code = req.body.code || req.body.accessCode;

    // Validation
    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Code is required'
      });
    }

    // Find access code by code value only (EXACT match, case-sensitive)
    const accessCode = await AccessCode.findOne({
      code: code,  // Exact match, case-sensitive
      active: true
    });

    if (!accessCode) {
      const masked = typeof code === 'string' ? (code.length > 4 ? '*'.repeat(code.length - 4) + code.slice(-4) : '****') : '****';
      await logSecurityEvent({
        type: 'invalid_access_code',
        description: `Invalid or expired code attempt: ${masked}`,
        ipAddress: req.ip,
        severity: 'warning'
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

    // Check user limit (fast-fail, we'll also try to increment atomically later)
    if (accessCode.maxUsers && accessCode.currentUsers >= accessCode.maxUsers) {
      return res.status(429).json({
        success: false,
        message: 'Access code capacity reached'
      });
    }

    // ✅ Access codes are ONLY for admin, developer, assistant, parent
    // NOT for students - they must register and wait for approval
    const allowedRoles = ['admin', 'developer', 'assistant', 'parent'];

    // 🎯 FIXED: Use role field from the access code, fallback to type mapping
    let codeRole = accessCode.role;

    // If role is not set, map from type field
    if (!codeRole) {
      const typeToRoleMap = {
        'developer': 'developer',
        'admin': 'admin',
        'assistant': 'assistant',
        'parent': 'parent',
        'teacher': 'assistant'  // Teachers use assistant role
      };
      codeRole = typeToRoleMap[accessCode.type] || accessCode.type;
    }

    // Validate the role is in allowed list
    if (!allowedRoles.includes(codeRole)) {
      return res.status(403).json({
        success: false,
        message: `Access code is not valid for staff account (type: ${accessCode.type})`
      });
    }

    // Log successful code use (non-blocking)
    logSecurityEvent({
      type: 'access_code_verified',
      description: `Access code verified: ${accessCode.type} (${codeRole})`,
      ipAddress: req.ip,
      severity: 'info'
    }).catch(err => console.warn('Security log error:', err.message));

    // ✅ SIMPLIFIED FIX: Find existing approved user with this role
    // This ensures LiveSession.hostId is a valid MongoDB ObjectId
    let user = await User.findOne({
      role: codeRole,
      status: 'approved'
    }).sort({ createdAt: 1 }); // Get the oldest approved user with this role

    // Generate JWT token with REAL user ID if found, otherwise use an access-scoped identifier
    // Avoid hardcoded fallback ids; use an access-prefixed identifier so callers can detect it
    const token = user ? generateToken(user) : generateAccessToken(accessCode._id.toString(), codeRole);
    const redirectTo = accessCode.redirectTo || (codeRole === 'parent' ? '/parent-dashboard' : '/dashboard');

    // Update usage tracking if applicable. For maxUsers do an atomic conditional increment
    if (accessCode.maxUsers) {
      const updated = await AccessCode.findOneAndUpdate(
        { _id: accessCode._id, "$expr": { "$lt": ["$currentUsers", "$maxUsers"] } },
        { "$inc": { currentUsers: 1 } },
        { new: true }
      );
      if (!updated) {
        return res.status(429).json({ success: false, message: 'Access code capacity reached' });
      }
      accessCode.currentUsers = updated.currentUsers;
    } else if (accessCode.maxViewsPerUser) {
      accessCode.currentUsers = (accessCode.currentUsers || 0) + 1;
      await accessCode.save();
    }

    res.status(200).json({
      success: true,
      message: 'Access code verified',
      data: {
        token: token,
        redirectTo: redirectTo,
        role: codeRole,
        valid: true,
        accessType: accessCode.type,
        expiryDate: accessCode.expiryDate,
        remainingUsers: accessCode.maxUsers
          ? (accessCode.maxUsers - accessCode.currentUsers)
          : null,
        // ✅ Return real user object for frontend (with fallback)
        user: user ? {
          id: user._id,
          _id: user._id,
          role: user.role,
          firstName: user.firstName,
          lastName: user.lastName,
          status: user.status,
          phoneNumber: user.phoneNumber
        } : {
          id: '000000000000000000000001',
          _id: '000000000000000000000001',
          role: codeRole,
          firstName: 'System',
          lastName: 'Access',
          status: 'approved',
          phoneNumber: ''
        }
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

    // ✅ Handle access code users (no DB lookup needed)
    const isAccessUser = req.user?.type === 'access_code_verification' || (req.user.id && typeof req.user.id === 'string' && (req.user.id.startsWith('access_') || req.user.id === '000000000000000000000001'));
    if (isAccessUser) {
      return res.status(200).json({
        success: true,
        data: {
          id: req.user.id,
          role: req.user.role,
          status: 'approved',
          firstName: 'Developer',
          lastName: 'Access',
          phoneNumber: '',
          email: '',
          photoURL: '',
          grade: null,
          curriculum: null
        }
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

    // ✅ Handle access code users
    const isAccessUser = req.user?.type === 'access_code_verification' || (req.user.id && typeof req.user.id === 'string' && (req.user.id.startsWith('access_') || req.user.id === '000000000000000000000001'));
    if (isAccessUser) {
      const newToken = generateAccessToken(req.user.id, req.user.role);
      return res.status(200).json({
        success: true,
        message: 'Token refreshed',
        token: newToken
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
        severity: 'info'
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

// Get pending users for admin approval
exports.getPendingUsers = async (req, res) => {
  try {
    // Extract user info from token (must be admin/assistant/developer)
    const user = req.user || req.admin;
    if (!user || !['admin', 'assistant', 'developer'].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized - Admin access required'
      });
    }

    // Query pending users from database using Mongoose
    const pendingUsers = await User.find({
      $or: [
        { status: 'pending' },
        { status: 'Pending' }
      ]
    }).select('-password'); // Exclude passwords from response

    return res.json({
      success: true,
      message: 'Pending users retrieved successfully',
      data: pendingUsers,
      count: pendingUsers.length
    });
  } catch (error) {
    console.error('Error fetching pending users:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching pending users: ' + error.message
    });
  }
};

// Get all users (for admin dashboard)
exports.getAllUsers = async (req, res) => {
  try {
    // Extract user info from token (must be admin/assistant/developer)
    const user = req.user || req.admin;
    if (!user || !['admin', 'assistant', 'developer'].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized - Admin access required'
      });
    }

    // Query all users from database using Mongoose
    const allUsers = await User.find({}).select('-password'); // Exclude passwords

    return res.json({
      success: true,
      message: 'All users retrieved successfully',
      data: allUsers,
      count: allUsers.length
    });
  } catch (error) {
    console.error('Error fetching all users:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching all users: ' + error.message
    });
  }
};

// Get blocked users
exports.getBlockedUsers = async (req, res) => {
  try {
    // Extract user info from token (must be admin/assistant/developer)
    const user = req.user || req.admin;
    if (!user || !['admin', 'assistant', 'developer'].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized - Admin access required'
      });
    }

    // Query blocked users from database using Mongoose
    const blockedUsers = await User.find({
      $or: [
        { status: 'blocked' },
        { status: 'Blocked' }
      ]
    }).select('-password'); // Exclude passwords

    return res.json({
      success: true,
      message: 'Blocked users retrieved successfully',
      data: blockedUsers,
      count: blockedUsers.length
    });
  } catch (error) {
    console.error('Error fetching blocked users:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching blocked users: ' + error.message
    });
  }
};

// Get approved users
exports.getApprovedUsers = async (req, res) => {
  try {
    // Extract user info from token (must be admin/assistant/developer)
    const user = req.user || req.admin;
    if (!user || !['admin', 'assistant', 'developer'].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized - Admin access required'
      });
    }

    // Query approved users from database using Mongoose
    const approvedUsers = await User.find({
      $or: [
        { status: 'approved' },
        { status: 'Approved' },
        { status: 'active' },
        { status: 'Active' }
      ]
    }).select('-password'); // Exclude passwords

    return res.json({
      success: true,
      message: 'Approved users retrieved successfully',
      data: approvedUsers,
      count: approvedUsers.length
    });
  } catch (error) {
    console.error('Error fetching approved users:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching approved users: ' + error.message
    });
  }
};


/**
 * Get current user's status
 * GET /api/auth/status
 */
exports.getUserStatus = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const userIdStr = userId.toString();
    // ✅ Handle access code users (not real database users)
    const isAccessUser = req.user?.type === 'access_code_verification' ||
      userIdStr.startsWith('access_') ||
      userIdStr === '000000000000000000000001';

    if (isAccessUser) {
      console.log('🔐 Access code user - returning approved status:', userId);
      return res.json({
        success: true,
        data: {
          id: userId,
          status: 'approved',
          blockedReason: null,
          blockedAt: null,
          blockedBy: null,
          suspensionReason: null,
          suspendedAt: null
        }
      });
    }

    // ✅ Validate if userId is a valid MongoDB ObjectId format
    if (!userId || typeof userId !== 'string' || !/^[0-9a-fA-F]{24}$/.test(userId)) {
      console.error('❌ Invalid user ID format:', userId);
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format',
        error: 'INVALID_USER_ID'
      });
    }

    const user = await User.findById(userId).select('status blockedReason blockedAt blockedBy suspensionReason suspendedAt');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    return res.json({
      success: true,
      data: {
        id: user._id,
        status: user.status,
        blockedReason: user.blockedReason || null,
        blockedAt: user.blockedAt || null,
        blockedBy: user.blockedBy || null,
        suspensionReason: user.suspensionReason || null,
        suspendedAt: user.suspendedAt || null
      }
    });
  } catch (error) {
    console.error('Get user status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error getting user status: ' + error.message
    });
  }
};
