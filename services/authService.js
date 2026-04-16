// ==========================================
// AUTHENTICATION SERVICE
// ==========================================

const User = require('../models/User');
const SecurityLog = require('../models/SecurityLog');
const { generateToken } = require('../utils/jwt');
const { hashPassword, verifyPassword } = require('../utils/helpers');
const bcrypt = require('bcryptjs');

/**
 * Register New User
 */
const registerUser = async (userData) => {
  try {
    // Check if user already exists
    const existingUser = await User.findOne({ phoneNumber: userData.phoneNumber });
    if (existingUser) {
      throw {
        status: 409,
        message: 'Phone number already registered',
        error: 'PHONE_EXISTS'
      };
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(userData.password, 10);

    // Create user
    const user = new User({
      ...userData,
      password: hashedPassword,
      status: 'pending',
      photoURL: `https://api.dicebear.com/7.x/avataaars/svg?seed=${userData.phoneNumber}`
    });

    await user.save();

    // Log security event
    await SecurityLog.create({
      type: 'user_registered',
      message: `User registered: ${user.fullName}`,
      userId: user._id,
      userName: user.fullName,
      userRole: user.role,
      severity: 'info'
    });

    const token = generateToken(user._id, user.role);

    return {
      user: user.toJSON(),
      token
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Login User
 */
const loginUser = async (phoneNumber, password) => {
  try {
    const user = await User.findOne({ phoneNumber }).select('+password');

    if (!user) {
      throw {
        status: 401,
        message: 'Invalid credentials',
        error: 'INVALID_CREDENTIALS'
      };
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      // Log failed attempt
      await SecurityLog.create({
        type: 'login_failed',
        message: `Failed login attempt`,
        userId: user._id,
        userName: user.fullName,
        userRole: user.role,
        severity: 'warning'
      });

      throw {
        status: 401,
        message: 'Invalid credentials',
        error: 'INVALID_CREDENTIALS'
      };
    }

    // Check account status
    if (user.status === 'suspended') {
      throw {
        status: 403,
        message: 'Account suspended',
        error: 'ACCOUNT_SUSPENDED',
        reason: user.suspensionReason
      };
    }

    if (user.status === 'blocked') {
      throw {
        status: 403,
        message: 'Account blocked',
        error: 'ACCOUNT_BLOCKED',
        reason: user.blockedReason
      };
    }

    if (user.status === 'rejected') {
      throw {
        status: 403,
        message: 'Account rejected',
        error: 'ACCOUNT_REJECTED'
      };
    }

    // Update last login
    user.lastLoginAt = new Date();
    user.isOnline = true;
    await user.save();

    // Log successful login
    await SecurityLog.create({
      type: 'login_success',
      message: `User logged in: ${user.fullName}`,
      userId: user._id,
      userName: user.fullName,
      userRole: user.role,
      severity: 'info'
    });

    const token = generateToken(user._id, user.role);

    return {
      user: user.toJSON(),
      token,
      canAccessVideos: user.videoAccessUnlocked || user.role !== 'student',
      canAccessAI: user.aiAccessUnlocked || user.role !== 'student',
      accountStatus: user.status
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Verify Access Code (Video/AI)
 */
const verifyAccessCode = async (userId, code, type = 'video') => {
  try {
    const AccessCode = require('../models/AccessCode');

    const accessCode = await AccessCode.findOne({
      code: code.toUpperCase(),
      type,
      active: true
    });

    if (!accessCode) {
      throw {
        status: 400,
        message: 'Invalid access code',
        error: 'INVALID_CODE'
      };
    }

    // Check expiry
    if (accessCode.expiryDate && accessCode.expiryDate < new Date()) {
      throw {
        status: 400,
        message: 'Access code expired',
        error: 'CODE_EXPIRED'
      };
    }

    // Check max users
    if (accessCode.maxUsers && accessCode.currentUsers >= accessCode.maxUsers) {
      throw {
        status: 400,
        message: 'Access code limit reached',
        error: 'CODE_LIMIT_REACHED'
      };
    }

    // Check user views limit
    const usage = accessCode.usageByUser?.get(userId.toString());
    if (usage && accessCode.maxViewsPerUser && usage.views >= accessCode.maxViewsPerUser) {
      throw {
        status: 400,
        message: 'View limit reached',
        error: 'VIEW_LIMIT_REACHED'
      };
    }

    // Update usage
    if (!accessCode.usageByUser) {
      accessCode.usageByUser = new Map();
    }

    if (!usage) {
      accessCode.usageByUser.set(userId.toString(), {
        views: 1,
        unlockedAt: new Date()
      });
      accessCode.currentUsers += 1;
    } else {
      usage.views += 1;
      accessCode.usageByUser.set(userId.toString(), usage);
    }

    await accessCode.save();

    // Update user access
    const user = await User.findById(userId);
    if (type === 'video') {
      user.videoAccessUnlocked = true;
      user.videoAccessCode = code.toUpperCase();
    } else if (type === 'ai') {
      user.aiAccessUnlocked = true;
      user.aiAccessCode = code.toUpperCase();
    }
    await user.save();

    return {
      success: true,
      message: `${type === 'video' ? 'Video' : 'AI'} access unlocked`,
      expiryDate: accessCode.expiryDate
    };
  } catch (error) {
    throw error;
  }
};

module.exports = {
  registerUser,
  loginUser,
  verifyAccessCode
};
