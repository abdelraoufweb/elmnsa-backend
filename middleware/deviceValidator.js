// ==========================================
// DEVICE VALIDATOR MIDDLEWARE
// ==========================================
// Ensures students can only login from approved devices

const crypto = require('crypto');

/**
 * Generate device fingerprint from user agent and IP
 */
function generateDeviceFingerprint(userAgent, ip) {
  const data = `${userAgent}-${ip}`;
  return crypto.createHash('sha256').update(data).digest('hex').substring(0, 16);
}

/**
 * Middleware to check if device is approved for student login
 */
async function validateDeviceAccess(req, res, next) {
  try {
    // Only apply to students
    if (req.user?.role !== 'student') {
      return next();
    }

    const User = require('../models/User');
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    // If device approval is disabled, allow access
    if (!user.requireDeviceApproval) {
      return next();
    }

    // Generate device ID from request
    const userAgent = req.headers['user-agent'] || 'unknown';
    const ip = req.ip || req.connection.remoteAddress;
    const deviceId = generateDeviceFingerprint(userAgent, ip);

    // Check if device is approved
    const isApproved = user.approvedDevices?.some(device => device.deviceId === deviceId);

    if (!isApproved) {
      return res.status(403).json({
        success: false,
        message: 'Device not approved. Contact Admin/Assistant for approval.',
        requiresApproval: true,
        deviceId: deviceId
      });
    }

    // Update last used time
    const deviceIndex = user.approvedDevices.findIndex(d => d.deviceId === deviceId);
    if (deviceIndex !== -1) {
      user.approvedDevices[deviceIndex].lastUsedAt = new Date();
      await user.save();
    }

    req.deviceId = deviceId;
    next();
  } catch (error) {
    console.error('Device validation error:', error);
    res.status(500).json({
      success: false,
      message: 'Device validation failed'
    });
  }
}

module.exports = {
  generateDeviceFingerprint,
  validateDeviceAccess
};
