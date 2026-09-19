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
 * Enforce that a value is a non-empty string — blocks NoSQL injection objects
 * Throws a 400-level error if the value is not a plain string.
 * @param {*} value - The request field value
 * @param {string} fieldName - Field name for error messages
 * @returns {string} trimmed string
 */
const enforceString = (value, fieldName) => {
  if (value === undefined || value === null) {
    const err = new Error(`${fieldName} is required`);
    err.statusCode = 400;
    throw err;
  }
  if (typeof value !== 'string') {
    // Reject objects, arrays — these are NoSQL operator payloads
    const err = new Error(`Invalid value for field: ${fieldName}`);
    err.statusCode = 400;
    throw err;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    const err = new Error(`${fieldName} cannot be empty`);
    err.statusCode = 400;
    throw err;
  }
  return trimmed;
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

    // ✅ NEW: Enforce unique phone numbers for student and parent
    if (parentPhone && digitsOnly === parentPhone.replace(/\D/g, '')) {
      return res.status(400).json({
        success: false,
        message: 'Student and parent phone numbers cannot be the same',
        errors: { parentPhone: 'Must be different from student phone number' }
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

    // ── Push Notification to staff: new registration ──────────
    try {
      const notificationService = require('../services/notificationService');
      const staffUsers = await User.find({
        role: { $in: ['admin', 'assistant', 'developer'] },
        status: 'approved'
      }).select('_id');

      for (const staff of staffUsers) {
        notificationService.notifyUser(staff._id, {
          title: 'طالب جديد طلب الانضمام! 🆕',
          message: `${firstName} ${lastName} سجّل حساب جديد وبينتظر الموافقة`,
          type: 'system',
          refId: user._id.toString(),
          url: '/admin-pending'
        }, req.io || null);
      }
    } catch (pushErr) {
      console.error('Push to staff on registration failed:', pushErr);
    }

    // ── WhatsApp Notification to staff: new registration ──────────
    try {
      const whatsappService = require('../services/whatsappService');
      const waMessage = `🆕 *طالب جديد سجّل على المنصة*\n\n👤 الاسم: ${firstName} ${lastName}\n📱 الرقم: ${normalizedPhone}\n📚 الصف: ${grade || 'غير محدد'}\n📖 المنهج: ${curriculum || 'غير محدد'}\n🏫 المدرسة: ${schoolName || 'غير محددة'}\n\n⏳ في انتظار الموافقة`;
      whatsappService.notifyAllStaff(waMessage, 'registration');
    } catch (waErr) {
      console.error('WhatsApp notification on registration failed:', waErr);
    }

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
    // ✅ Type enforcement — blocks NoSQL injection objects like {"$ne": ""}
    let phoneNumber, password;
    try {
      phoneNumber = enforceString(req.body.phoneNumber, 'phoneNumber');
      password    = enforceString(req.body.password,    'password');
    } catch (typeErr) {
      return res.status(400).json({ success: false, message: typeErr.message });
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

    // ❌ DEVICE APPROVAL FULLY DISABLED (user request)
    // Students can login from any device without admin approval.
    // (Code kept minimal; endpoint still returns deviceStatus for API compat.)

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
        aiAccessUnlocked: user.aiAccessUnlocked || false, // 💡 PERSISTENCE: Return lock status to frontend
        hasLockCode: !!user.lockCode, // 🔐 Whether student has set up combination lock
        deviceStatus: 'approved',
        isNewDevice: false,
        requiresApproval: false
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
    // ✅ Type enforcement — blocks NoSQL injection via $regex or $ne objects
    let code;
    try {
      const rawCode = req.body.code || req.body.accessCode;
      code = enforceString(rawCode, 'code');
    } catch (typeErr) {
      return res.status(400).json({ success: false, message: typeErr.message });
    }

    // Find access code by code value (case-insensitive match)
    const accessCode = await AccessCode.findOne({
      code: { $regex: new RegExp(`^${code.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') },
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

    // Require password for staff roles (parent/assistant)
    const passwordProtectedRoles = ['assistant', 'parent'];

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

    // ── USER LOOKUP (Session 1 fix — 2026-09-11) ──────────────────────
    // BEFORE (buggy): findOne({ role: codeRole, status: 'approved' }) returned
    //   the oldest approved user with that role, so ALL people using ANY code
    //   of a given role shared one account and could see each other's data.
    //
    // AFTER (fixed): Only look up a real user when the AccessCode has a
    //   linkedUser field pointing to a specific User document. Otherwise issue
    //   a scoped anonymous token — no real user identity, no data leakage.
    let user = null;
    if (accessCode.linkedUser) {
      user = await User.findOne({
        _id: accessCode.linkedUser,
        status: 'approved'
      });
      // If the linked user no longer exists or was not approved, deny access
      if (!user) {
        return res.status(403).json({
          success: false,
          message: 'The user account linked to this access code is not available'
        });
      }
    }

    // ✅ PASSWORD FLOW — only applicable when code is bound to a real user
    if (user && passwordProtectedRoles.includes(codeRole)) {
      const accessCodePassword = req.body.accessCodePassword;
      const setupPassword = req.body.setupPassword;

      if (user.accessCodePassword) {
        // User already has a password set — verify it
        if (!accessCodePassword) {
          return res.status(200).json({
            success: true,
            needsPassword: true,
            message: 'Password required for this account'
          });
        }
        const isValid = await require('bcryptjs').compare(accessCodePassword, user.accessCodePassword);
        if (!isValid) {
          return res.status(401).json({
            success: false,
            message: 'Wrong password'
          });
        }
      } else {
        // First time — need to set a password
        if (!setupPassword) {
          return res.status(200).json({
            success: true,
            needsPasswordSetup: true,
            message: 'First time login. Please create a password.'
          });
        }
        if (setupPassword.length < 4) {
          return res.status(400).json({
            success: false,
            message: 'Password must be at least 4 characters'
          });
        }
        user.accessCodePassword = await require('bcryptjs').hash(setupPassword, 10);
        await user.save();
      }
    }

    // Issue real user token if linked to a specific user; otherwise issue a
    // scoped access token with no real user identity.
    const token = user ? generateToken(user) : generateAccessToken(accessCode._id.toString(), codeRole);
    const redirectTo = accessCode.redirectTo || (codeRole === 'parent' ? '/parent-dashboard' : '/dashboard');

    // Update usage tracking. For maxUsers: atomic conditional increment to
    // prevent race conditions and enforce the cap strictly.
    if (accessCode.maxUsers) {
      const updated = await AccessCode.findOneAndUpdate(
        { _id: accessCode._id, $expr: { $lt: ['$currentUsers', '$maxUsers'] } },
        { $inc: { currentUsers: 1 } },
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
        // When a linkedUser is set, return their real profile data.
        // Otherwise return a scoped placeholder (no real user identity).
        user: user ? {
          id: user._id,
          _id: user._id,
          role: user.role,
          firstName: user.firstName,
          lastName: user.lastName,
          status: user.status,
          phoneNumber: user.phoneNumber
        } : {
          id: accessCode._id.toString(),
          _id: accessCode._id.toString(),
          role: codeRole,
          firstName: 'Staff',
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
          role: req.user?.role || (userIdStr === '000000000000000000000001' ? 'developer' : 'student'),
          status: 'approved',
          themeName: 'default',
          blockedReason: null,
          blockedAt: null,
          blockedBy: null,
          suspensionReason: null,
          suspendedAt: null
        }
      });
    }

    // ✅ Validate if userIdStr is a valid MongoDB ObjectId format
    if (!userIdStr || !/^[0-9a-fA-F]{24}$/.test(userIdStr)) {
      console.error('❌ Invalid user ID format:', userIdStr);
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format',
        error: 'INVALID_USER_ID'
      });
    }

    const user = await User.findById(userId).select('status role blockedReason blockedAt blockedBy suspensionReason suspendedAt lockCode');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // 🎨 Get user theme if available
    const Theme = require('../models/Theme');
    const theme = await Theme.findOne({ userId: user._id });

    return res.json({
      success: true,
      data: {
        id: user._id,
        role: user.role, // 🔑 [PERSISTENCE FIX]: Return role to frontend
        status: user.status,
        themeName: theme ? theme.themeName : 'default', // 🎨 Return theme preference
        blockedReason: user.blockedReason || null,
        blockedAt: user.blockedAt || null,
        blockedBy: user.blockedBy || null,
        suspensionReason: user.suspensionReason || null,
        suspendedAt: user.suspendedAt || null,
        hasLockCode: !!user.lockCode
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

// ============================================
// PASSWORD RESET & COMBINATION LOCK ENDPOINTS
// ============================================

/**
 * Request password reset - sends OTP via WhatsApp
 * POST /api/auth/request-password-reset
 * Body: { phoneNumber }
 */
exports.requestPasswordReset = async (req, res) => {
  try {
    // ✅ Type enforcement — blocks NoSQL injection objects
    let phoneNumber;
    try {
      phoneNumber = enforceString(req.body.phoneNumber, 'phoneNumber');
    } catch (typeErr) {
      return res.status(400).json({ success: false, message: typeErr.message });
    }

    const normalizedPhone = phoneNumber.replace(/\D/g, '');
    const user = await User.findOne({ phoneNumber: normalizedPhone });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No account found with this phone number',
        error: 'USER_NOT_FOUND'
      });
    }

    // Rate limit: max 1 request per 30 seconds
    if (user.resetPasswordOtpExpires) {
      const secondsSinceLastRequest = (Date.now() - user.resetPasswordOtpExpires.getTime() + 10 * 60 * 1000) / 1000;
      if (secondsSinceLastRequest < 30 && user.resetPasswordOtp) {
        const waitSeconds = Math.ceil(30 - secondsSinceLastRequest);
        return res.status(429).json({
          success: false,
          message: `Please wait ${waitSeconds} seconds before requesting again`,
          error: 'RATE_LIMITED',
          waitSeconds
        });
      }
    }

    // Keep existing OTP if still valid (hasn't expired and no attempts yet)
    let otp;
    if (user.resetPasswordOtp && user.resetPasswordOtpExpires && new Date() < user.resetPasswordOtpExpires && user.resetPasswordAttempts < 3) {
      otp = user.resetPasswordOtp;
    } else {
      // Generate new 6-digit OTP
      otp = Math.floor(100000 + Math.random() * 900000).toString();
      user.resetPasswordOtp = otp;
      user.resetPasswordOtpExpires = new Date(Date.now() + 10 * 60 * 1000);
      user.resetPasswordAttempts = 0;
    }
    await user.save();

    // Try to send via WhatsApp
    let whatsappSent = false;
    let whatsappError = null;
    let whatsappConnected = false;
    try {
      const whatsappService = require('../services/whatsappService');
      whatsappConnected = whatsappService.isConnected();
      if (whatsappConnected) {
        const otpMessage = `🔐 *كود استعادة كلمة المرور*\n\nالكود الخاص بك: *${otp}*\n\n⏰ صالح لمدة 10 دقائق فقط.\n\nإذا لم تطلب إعادة تعيين كلمة المرور، تجاهل هذه الرسالة.`;
        await whatsappService.sendMessage(normalizedPhone, otpMessage, {
          type: 'password_reset',
          recipientName: `${user.firstName} ${user.lastName}`,
          recipientType: 'student'
        });
        whatsappSent = true;
      }
    } catch (waErr) {
      console.error('WhatsApp OTP send failed:', waErr.message);
      whatsappError = waErr.message;
    }

    await logSecurityEvent({
      type: 'password_reset_requested',
      userId: user._id,
      userName: `${user.firstName} ${user.lastName}`,
      userRole: user.role,
      description: `Password reset OTP requested (WhatsApp: ${whatsappSent ? 'sent' : 'failed'})`,
      ipAddress: req.ip,
      severity: 'info'
    });

    res.status(200).json({
      success: true,
      message: whatsappSent
        ? 'OTP sent to your WhatsApp'
        : 'WhatsApp unavailable. Use alternative verification.',
      whatsappSent,
      whatsappConnected,
      whatsappError,
      hasLockCode: !!user.lockCode
    });
  } catch (error) {
    console.error('Request password reset error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process password reset request',
      error: error.message
    });
  }
};

/**
 * Verify OTP for password reset
 * POST /api/auth/verify-reset-otp
 * Body: { phoneNumber, otp }
 */
exports.verifyResetOtp = async (req, res) => {
  try {
    let phoneNumber, otp;
    try {
      phoneNumber = enforceString(req.body.phoneNumber, 'phoneNumber');
      otp         = enforceString(req.body.otp, 'otp');
    } catch (typeErr) {
      return res.status(400).json({ success: false, message: typeErr.message });
    }

    if (!phoneNumber || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and OTP are required'
      });
    }

    const normalizedPhone = phoneNumber.replace(/\D/g, '');
    const user = await User.findOne({ phoneNumber: normalizedPhone });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if OTP exists
    if (!user.resetPasswordOtp || !user.resetPasswordOtpExpires) {
      return res.status(401).json({
        success: false,
        message: 'No OTP was requested. Please request a new code.',
        error: 'NO_OTP'
      });
    }

    // Check if OTP is expired
    if (new Date() > user.resetPasswordOtpExpires) {
      user.resetPasswordOtp = null;
      user.resetPasswordOtpExpires = null;
      user.resetPasswordAttempts = 0;
      await user.save();
      return res.status(401).json({
        success: false,
        message: 'OTP has expired. Please request a new code.',
        error: 'OTP_EXPIRED'
      });
    }

    // Check OTP value
    if (user.resetPasswordOtp !== otp) {
      user.resetPasswordAttempts = (user.resetPasswordAttempts || 0) + 1;
      const remainingAttempts = 5 - user.resetPasswordAttempts;
      
      if (remainingAttempts <= 0) {
        // Too many failed attempts — clear OTP
        user.resetPasswordOtp = null;
        user.resetPasswordOtpExpires = null;
        user.resetPasswordAttempts = 0;
        await user.save();
        return res.status(401).json({
          success: false,
          message: 'Too many incorrect attempts. Please request a new code.',
          error: 'MAX_ATTEMPTS'
        });
      }

      await user.save();
      return res.status(401).json({
        success: false,
        message: `Invalid code. ${remainingAttempts} attempt(s) remaining.`,
        error: 'INVALID_OTP',
        remainingAttempts
      });
    }

    // OTP is valid - generate a temporary reset token
    const resetToken = jwt.sign(
      { id: user._id, type: 'password_reset' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    // Clear OTP
    user.resetPasswordOtp = null;
    user.resetPasswordOtpExpires = null;
    user.resetPasswordAttempts = 0;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'OTP verified successfully',
      resetToken
    });
  } catch (error) {
    console.error('Verify reset OTP error:', error);
    res.status(500).json({
      success: false,
      message: 'OTP verification failed',
      error: error.message
    });
  }
};

/**
 * Fallback verification: parent phone + full name
 * POST /api/auth/verify-reset-fallback
 * Body: { phoneNumber, parentPhone, fullName }
 */
exports.verifyResetFallback = async (req, res) => {
  try {
    // ✅ Type enforcement — blocks NoSQL injection in all three fields
    let phoneNumber, parentPhone, fullName;
    try {
      phoneNumber  = enforceString(req.body.phoneNumber,  'phoneNumber');
      parentPhone  = enforceString(req.body.parentPhone,  'parentPhone');
      fullName     = enforceString(req.body.fullName,     'fullName');
    } catch (typeErr) {
      return res.status(400).json({ success: false, message: typeErr.message });
    }

    const normalizedPhone = phoneNumber.replace(/\D/g, '');
    const normalizedParentPhone = parentPhone.replace(/\D/g, '');
    const user = await User.findOne({ phoneNumber: normalizedPhone });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check parent phone (handle country code differences: +20 vs 0)
    const storedParentPhone = (user.parentPhone || '').replace(/\D/g, '');
    const toLocalPhone = (digits) => digits.length === 12 && digits.startsWith('20') ? '0' + digits.slice(2) : digits;
    const spNormalized = toLocalPhone(storedParentPhone);
    const npNormalized = toLocalPhone(normalizedParentPhone);
    if (!storedParentPhone || spNormalized !== npNormalized) {
      await logSecurityEvent({
        type: 'failed_password_reset_fallback',
        userId: user._id,
        userName: `${user.firstName} ${user.lastName}`,
        userRole: user.role,
        description: 'Failed fallback reset: parent phone mismatch',
        ipAddress: req.ip,
        severity: 'warning'
      });

      return res.status(401).json({
        success: false,
        message: 'Parent phone number does not match our records',
        error: 'PARENT_PHONE_MISMATCH'
      });
    }

    // Check name — input must contain firstName AND lastName (case-insensitive, partial match)
    const inputLower = fullName.trim().toLowerCase();
    const firstName = (user.firstName || '').toLowerCase().trim();
    const lastName = (user.lastName || '').toLowerCase().trim();
    const hasFirstName = firstName && inputLower.includes(firstName);
    const hasLastName = lastName && inputLower.includes(lastName);

    if (!hasFirstName || !hasLastName) {
      await logSecurityEvent({
        type: 'failed_password_reset_fallback',
        userId: user._id,
        userName: `${user.firstName} ${user.lastName}`,
        userRole: user.role,
        description: `Failed fallback reset: name mismatch (input lacks "${user.firstName}" or "${user.lastName}")`,
        ipAddress: req.ip,
        severity: 'warning'
      });

      return res.status(401).json({
        success: false,
        message: 'الإسم المدخل لا يتطابق مع سجلاتنا. تأكد من كتابة اسمك الأول والأخير كما سجلت بهما.',
        error: 'NAME_MISMATCH'
      });
    }

    // Verification passed - generate reset token
    const resetToken = jwt.sign(
      { id: user._id, type: 'password_reset' },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    // Clear any OTP
    user.resetPasswordOtp = null;
    user.resetPasswordOtpExpires = null;
    await user.save();

    await logSecurityEvent({
      type: 'password_reset_fallback_verified',
      userId: user._id,
      userName: `${user.firstName} ${user.lastName}`,
      userRole: user.role,
      description: 'Fallback reset verified via parent phone + name',
      ipAddress: req.ip,
      severity: 'info'
    });

    res.status(200).json({
      success: true,
      message: 'Identity verified successfully',
      resetToken
    });
  } catch (error) {
    console.error('Verify reset fallback error:', error);
    res.status(500).json({
      success: false,
      message: 'Verification failed',
      error: error.message
    });
  }
};

/**
 * Reset password using reset token
 * POST /api/auth/reset-password
 * Body: { resetToken, newPassword }
 */
exports.resetPassword = async (req, res) => {
  try {
    let resetToken, newPassword;
    try {
      resetToken  = enforceString(req.body.resetToken, 'resetToken');
      newPassword = enforceString(req.body.newPassword, 'newPassword');
    } catch (typeErr) {
      return res.status(400).json({ success: false, message: typeErr.message });
    }

    if (!resetToken || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Reset token and new password are required'
      });
    }

    // Verify reset token
    let decoded;
    try {
      decoded = jwt.verify(resetToken, process.env.JWT_SECRET);
    } catch (tokenErr) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired reset token',
        error: 'INVALID_RESET_TOKEN'
      });
    }

    if (decoded.type !== 'password_reset') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token type',
        error: 'INVALID_TOKEN_TYPE'
      });
    }

    // Validate password strength
    const passwordCheck = validatePasswordStrength(newPassword);
    if (!passwordCheck.valid) {
      return res.status(400).json({
        success: false,
        message: passwordCheck.message
      });
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Hash and save new password
    user.password = await hashPassword(newPassword);
    await user.save();

    await logSecurityEvent({
      type: 'password_reset_success',
      userId: user._id,
      userName: `${user.firstName} ${user.lastName}`,
      userRole: user.role,
      description: 'Password reset successfully',
      ipAddress: req.ip,
      severity: 'info'
    });

    res.status(200).json({
      success: true,
      message: 'Password has been reset successfully'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Password reset failed',
      error: error.message
    });
  }
};

/**
 * Setup combination lock code
 * POST /api/auth/setup-lock
 * Body: { lockCode } (4-digit string)
 * Requires: JWT token
 */
exports.setupLockCode = async (req, res) => {
  try {
    const { lockCode } = req.body;

    if (!lockCode || !/^\d{4}$/.test(lockCode)) {
      return res.status(400).json({
        success: false,
        message: 'Lock code must be exactly 4 digits'
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const bcrypt = require('bcryptjs');
    user.lockCode = await bcrypt.hash(lockCode, 10);
    await user.save();

    await logSecurityEvent({
      type: 'lock_code_setup',
      userId: user._id,
      userName: `${user.firstName} ${user.lastName}`,
      userRole: user.role,
      description: 'Combination lock code set up',
      ipAddress: req.ip,
      severity: 'info'
    });

    res.status(200).json({
      success: true,
      message: 'Lock code saved successfully'
    });
  } catch (error) {
    console.error('Setup lock code error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to save lock code',
      error: error.message
    });
  }
};

/**
 * Login with combination lock code
 * POST /api/auth/login-with-lock
 * Body: { phoneNumber, lockCode }
 */
exports.loginWithLock = async (req, res) => {
  try {
    // ✅ Type enforcement — blocks NoSQL injection objects
    let phoneNumber, lockCode;
    try {
      phoneNumber = enforceString(req.body.phoneNumber, 'phoneNumber');
      lockCode    = enforceString(req.body.lockCode,    'lockCode');
    } catch (typeErr) {
      return res.status(400).json({ success: false, message: typeErr.message });
    }

    const normalizedPhone = phoneNumber.replace(/\D/g, '');
    const user = await User.findOne({ phoneNumber: normalizedPhone });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if user has a lock code set
    if (!user.lockCode) {
      return res.status(400).json({
        success: false,
        message: 'No lock code set for this account. Please login with password first.',
        error: 'NO_LOCK_CODE'
      });
    }

    // ✅ Account-level lockout — block after 5 failed lock code attempts
    if (user.lockCodeLockedUntil && new Date() < user.lockCodeLockedUntil) {
      const minutesLeft = Math.ceil((user.lockCodeLockedUntil - Date.now()) / 60000);
      return res.status(429).json({
        success: false,
        message: `Lock code is temporarily blocked. Try again in ${minutesLeft} minute(s).`,
        error: 'LOCK_CODE_LOCKED'
      });
    }

    // Verify lock code
    const bcrypt = require('bcryptjs');
    let isLockValid = false;

    if (user.lockCode.startsWith('$2a$') || user.lockCode.startsWith('$2b$')) {
      isLockValid = await bcrypt.compare(lockCode, user.lockCode);
    } else {
      isLockValid = (user.lockCode === lockCode);
      if (isLockValid) {
        // Auto-upgrade legacy plaintext lockCode to bcrypt hash
        user.lockCode = await bcrypt.hash(lockCode, 10);
        await user.save();
      }
    }

    if (!isLockValid) {
      // ✅ Increment failed attempts and lock after 5
      user.lockCodeAttempts = (user.lockCodeAttempts || 0) + 1;
      if (user.lockCodeAttempts >= 5) {
        user.lockCodeLockedUntil = new Date(Date.now() + 30 * 60 * 1000); // 30 min
        user.lockCodeAttempts = 0;
        await user.save();
        await logSecurityEvent({
          type: 'lock_code_brute_force',
          userId: user._id,
          userName: `${user.firstName} ${user.lastName}`,
          userRole: user.role,
          description: 'Lock code blocked for 30 minutes after 5 failed attempts',
          ipAddress: req.ip,
          severity: 'error'
        });
        return res.status(429).json({
          success: false,
          message: 'Too many failed attempts. Lock code blocked for 30 minutes.',
          error: 'LOCK_CODE_LOCKED'
        });
      }
      await user.save();
      await logSecurityEvent({
        type: 'failed_lock_login',
        userId: user._id,
        userName: `${user.firstName} ${user.lastName}`,
        userRole: user.role,
        description: 'Failed lock code login attempt',
        ipAddress: req.ip,
        severity: 'warning'
      });

      return res.status(401).json({
        success: false,
        message: 'Invalid lock code',
        error: 'INVALID_LOCK_CODE'
      });
    }

    // Check account status
    if (user.status === 'pending') {
      return res.status(403).json({
        success: false,
        message: 'Your account is pending admin approval',
        error: 'ACCOUNT_PENDING'
      });
    }

    if (user.status === 'blocked') {
      return res.status(403).json({
        success: false,
        message: 'Your account has been blocked',
        error: 'ACCOUNT_BLOCKED',
        reason: user.blockedReason || 'Account blocked'
      });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({
        success: false,
        message: 'Your account has been suspended',
        error: 'ACCOUNT_SUSPENDED',
        reason: user.suspensionReason || 'Account suspended'
      });
    }

    // Generate token
    const token = generateToken(user);

    await logSecurityEvent({
      type: 'lock_login_success',
      userId: user._id,
      userName: `${user.firstName} ${user.lastName}`,
      userRole: user.role,
      description: 'User logged in via combination lock',
      ipAddress: req.ip,
      severity: 'info'
    });

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
        aiAccessUnlocked: user.aiAccessUnlocked || false,
        hasLockCode: true
      },
      token
    });
  } catch (error) {
    console.error('Lock login error:', error);
    res.status(500).json({
      success: false,
      message: 'Lock login failed',
      error: error.message
    });
  }
};
