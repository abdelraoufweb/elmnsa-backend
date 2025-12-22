// ==========================================
// ADMIN CONTROLLER
// ==========================================

const User = require('../models/User');
const SecurityLog = require('../models/SecurityLog');
const Video = require('../models/Video');
const Message = require('../models/Message');

/**
 * Get dashboard statistics
 * GET /api/admin/dashboard
 */
exports.getDashboard = async (req, res) => {
  try {
    // Authorization
    if (!['admin', 'developer'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin or developer can access dashboard'
      });
    }

    // Count statistics
    const totalStudents = await User.countDocuments({ role: 'student' });
    const approvedStudents = await User.countDocuments({ role: 'student', status: 'approved' });
    const pendingStudents = await User.countDocuments({ role: 'student', status: 'pending' });
    const blockedStudents = await User.countDocuments({ role: 'student', status: 'blocked' });
    const totalVideos = await Video.countDocuments();
    const publishedVideos = await Video.countDocuments({ status: 'published' });
    const totalMessages = await Message.countDocuments();
    const unreadMessages = await Message.countDocuments({ read: false });

    res.status(200).json({
      success: true,
      data: {
        students: {
          total: totalStudents,
          approved: approvedStudents,
          pending: pendingStudents,
          blocked: blockedStudents
        },
        videos: {
          total: totalVideos,
          published: publishedVideos
        },
        messages: {
          total: totalMessages,
          unread: unreadMessages
        }
      }
    });
  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard',
      error: error.message
    });
  }
};

/**
 * Get security logs with filtering
 * GET /api/admin/logs?type=login&days=7&page=1&limit=20
 */
exports.getSecurityLogs = async (req, res) => {
  try {
    // Authorization
    if (!['admin', 'developer'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin or developer can view logs'
      });
    }

    const { type, days = 7, page = 1, limit = 20 } = req.query;

    // Build query
    const query = {};
    if (type) query.type = type;

    // Date filter
    const daysAgo = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    query.createdAt = { $gte: daysAgo };

    // Pagination
    const skip = (page - 1) * limit;

    // Fetch logs
    const logs = await SecurityLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Count total
    const total = await SecurityLog.countDocuments(query);

    res.status(200).json({
      success: true,
      data: logs,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch logs',
      error: error.message
    });
  }
};

/**
 * Get pending accounts for approval
 * GET /api/admin/pending-accounts
 */
exports.getPendingAccounts = async (req, res) => {
  try {
    // Authorization
    if (!['admin', 'developer'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin or developer can view pending accounts'
      });
    }

    const accounts = await User.find({ status: 'pending' })
      .select('-password')
      .sort({ registeredAt: -1 });

    res.status(200).json({
      success: true,
      data: accounts,
      count: accounts.length
    });
  } catch (error) {
    console.error('Get pending accounts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending accounts',
      error: error.message
    });
  }
};

/**
 * Approve user account
 * POST /api/admin/approve-account
 */
exports.approveAccount = async (req, res) => {
  try {
    // Authorization
    if (!['admin', 'developer'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin or developer can approve accounts'
      });
    }

    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID required'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.status = 'approved';
    user.approvedAt = new Date();
    user.approvedBy = req.user.id;
    await user.save();

    // Log action
    await SecurityLog.create({
      type: 'account_approved',
      userId: user._id,
      userName: `${user.firstName} ${user.lastName}`,
      userRole: user.role,
      description: `Account approved by ${req.user.role}`,
      severity: 'low'
    });

    res.status(200).json({
      success: true,
      message: 'Account approved successfully'
    });
  } catch (error) {
    console.error('Approve account error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve account',
      error: error.message
    });
  }
};

/**
 * Block user account
 * POST /api/admin/block-user
 */
exports.blockUser = async (req, res) => {
  try {
    // Authorization
    if (!['admin', 'developer'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin or developer can block users'
      });
    }

    const { userId, reason } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID required'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.status = 'blocked';
    user.blockedReason = reason || 'No reason provided';
    await user.save();

    // Log action
    await SecurityLog.create({
      type: 'user_blocked',
      userId: user._id,
      userName: `${user.firstName} ${user.lastName}`,
      userRole: user.role,
      description: `User blocked by ${req.user.role}: ${reason || 'No reason'}`,
      severity: 'high'
    });

    res.status(200).json({
      success: true,
      message: 'User blocked successfully'
    });
  } catch (error) {
    console.error('Block user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to block user',
      error: error.message
    });
  }
};

/**
 * Unblock user account
 * POST /api/admin/unblock-user
 */
exports.unblockUser = async (req, res) => {
  try {
    // Authorization
    if (!['admin', 'developer'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin or developer can unblock users'
      });
    }

    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID required'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    user.status = 'approved';
    user.blockedReason = null;
    await user.save();

    // Log action
    await SecurityLog.create({
      type: 'user_unblocked',
      userId: user._id,
      userName: `${user.firstName} ${user.lastName}`,
      userRole: user.role,
      description: `User unblocked by ${req.user.role}`,
      severity: 'low'
    });

    res.status(200).json({
      success: true,
      message: 'User unblocked successfully'
    });
  } catch (error) {
    console.error('Unblock user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unblock user',
      error: error.message
    });
  }
};
