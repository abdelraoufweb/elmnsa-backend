// ==========================================
// AUTHENTICATION MIDDLEWARE
// ==========================================

const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Authenticate JWT token from Authorization header
 * Token format: "Bearer <token>"
 */
const authMiddleware = async (req, res, next) => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`🔒 [AUTH] Request: ${req.method} ${req.url}`);
  }
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'No authorization token provided'
      });
    }

    // Extract token from "Bearer <token>"
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token format. Use: Bearer <token>'
      });
    }

    const token = parts[1];

    // Verify token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    // ✅ Validate decoded token structure
    if (!decoded || !decoded.id) {
      console.error('❌ [AUTH] Invalid token structure:', decoded);
      return res.status(401).json({
        success: false,
        message: 'Invalid token structure',
        error: 'INVALID_TOKEN_STRUCTURE'
      });
    }

    if (process.env.NODE_ENV === 'development') console.log('🔐 [AUTH] Token decoded, user ID:', decoded.id);

    // ✅ Handle access code users (no DB lookup needed)
    // These users have 'access_code_verification' type in token or are legacy mock IDs
    const isAccessUser = decoded.type === 'access_code_verification' ||
      (decoded.id && decoded.id.toString().startsWith('access_')) ||
      decoded.id === '000000000000000000000001';

    if (isAccessUser) {
      // 🎯 IMPROVEMENT: Double check if user exists even if it's an access user
      // This handles cases where an access code was used but a user profile exists
      try {
        const existingUser = await User.findById(decoded.id).select('-password').lean();
        if (existingUser) {
          console.log('✅ [AUTH] Real user found for access token:', existingUser._id);
          req.user = existingUser;
          return next();
        }
      } catch (e) {
        // ID might not be a valid ObjectId (like 'access_...') but we handle it below
      }

      console.log('⚡ [AUTH] Using temporary access-based user profile');
      req.user = {
        id: decoded.id,
        _id: decoded.id,
        role: decoded.role || 'guest',
        type: decoded.type || (decoded.id === '000000000000000000000001' ? 'access_code_verification' : null),
        firstName: decoded.firstName || 'Staff',
        lastName: 'Member',
        status: 'approved'
      };
      return next();
    }

    // ✅ Normal user lookup
    User.findById(decoded.id)
      .select('-password')
      .then(user => {
        if (!user) {
          console.error('❌ [AUTH] User not found in database, ID:', decoded.id);
          return res.status(401).json({
            success: false,
            message: 'User not found',
            error: 'USER_NOT_FOUND'
          });
        }

        if (process.env.NODE_ENV === 'development') console.log('✅ [AUTH] User found:', user._id, user.role);
        // Attach full user object to request
        req.user = user;
        next();
      })
      .catch(err => {
        console.error('❌ [AUTH] Error fetching user:', err);
        // If it's a cast error, it's an invalid ID format
        if (err.name === 'CastError') {
          return res.status(401).json({ success: false, message: 'Invalid token ID format' });
        }
        return res.status(500).json({
          success: false,
          message: 'Authentication error'
        });
      });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token has expired',
        error: 'TOKEN_EXPIRED'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token',
        error: 'INVALID_TOKEN'
      });
    }

    res.status(401).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

/**
 * Check if user has specific role(s)
 * Usage: authorize(['admin', 'developer'])
 */
const authorize = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    if (req.user.role === 'developer') return next();

    if (!allowedRoles.includes(req.user.role)) {
      console.warn(`⛔ [AUTH] Forbidden: User ${req.user._id} (${req.user.role}) attempted to access ${req.method} ${req.url}. Allowed roles: ${allowedRoles}`);
      return res.status(403).json({
        success: false,
        message: 'Forbidden - insufficient permissions',
        allowedRoles,
        userRole: req.user.role
      });
    }

    next();
  };
};

/**
 * Check if authenticated user is the resource owner
 */
const isOwner = (resourceField = 'id') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    const resourceId = req.params[resourceField] || req.body[resourceField];
    if (req.user.id !== resourceId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this resource'
      });
    }

    next();
  };
};

/**
 * Check specific permission
 */
const checkPermission = (permission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authenticated',
        error: 'NOT_AUTHENTICATED'
      });
    }

    // Developer has all permissions
    if (req.user.role === 'developer') {
      return next();
    }

    // Basic permission check - you can extend this with more detailed permissions
    if (req.user.role === 'admin' || req.user.role === 'assistant') {
      return next();
    }

    return res.status(403).json({
      success: false,
      message: 'Permission denied',
      error: 'PERMISSION_DENIED',
      requiredPermission: permission
    });
  };
};

/**
 * Optional Auth - Don't fail if no token, but attach user if valid
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');
      if (user) {
        req.user = user;
        req.token = token;
      }
    }

    next();
  } catch (error) {
    // Fail silently, user will be undefined
    next();
  }
};

module.exports = {
  authMiddleware,
  authorize,
  isOwner,
  checkPermission,
  optionalAuth
};
