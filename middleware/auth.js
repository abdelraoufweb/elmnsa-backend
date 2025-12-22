// ==========================================
// AUTHENTICATION MIDDLEWARE
// ==========================================

const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Authenticate JWT token from Authorization header
 * Token format: "Bearer <token>"
 */
const authMiddleware = (req, res, next) => {
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

    // Attach user info to request
    req.user = decoded;
    next();
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
      message: 'Authentication failed',
      error: error.message
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

    if (!allowedRoles.includes(req.user.role)) {
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
      const user = await User.findById(decoded.userId).select('-password');
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
