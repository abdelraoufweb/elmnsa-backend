// ==========================================
// ADMIN CONTROLLER
// ==========================================

const mongoose = require('mongoose');
const User = require('../models/User');
const SecurityLog = require('../models/SecurityLog');
const Video = require('../models/Video');
const Message = require('../models/Message');

const roleHierarchy = { 'student': 1, 'parent': 1, 'assistant': 2, 'admin': 3, 'developer': 4 };

/**
 * Get dashboard statistics
 * GET /api/admin/dashboard
 */
exports.getDashboard = async (req, res) => {
  try {
    // Authorization
    if (!['admin', 'developer', 'assistant'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin, developer, or assistant can access dashboard'
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
    if (!['admin', 'developer', 'assistant'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin, developer, or assistant can view logs'
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
    if (!['admin', 'developer', 'assistant'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin, developer, or assistant can view pending accounts'
      });
    }

    console.log(`📥 Fetching pending accounts...`);

    const accounts = await User.find({ status: 'pending' })
      .select('-password')
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    console.log(`✅ Found ${accounts.length} pending accounts`);

    res.status(200).json({
      success: true,
      data: accounts,
      count: accounts.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Get pending accounts error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending accounts',
      error: error.message
    });
  }
};

/**
 * Get all students (for admin list)
 * GET /api/admin/students
 */
exports.getAllStudents = async (req, res) => {
  try {
    // Authorization
    if (!['admin', 'developer', 'assistant'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin, developer, or assistant can view students'
      });
    }

    console.log(`📥 Fetching all students...`);

    // Get all students (exclude rejected and blocked)
    const students = await User.find({
      role: 'student',
      status: { $nin: ['rejected', 'blocked'] }
    })
      .select('-password')
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    console.log(`✅ Found ${students.length} students`);

    // Also get pending accounts count
    const pendingCount = await User.countDocuments({
      role: 'student',
      status: 'pending'
    });

    res.status(200).json({
      success: true,
      data: students,
      count: students.length,
      pendingCount: pendingCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Get all students error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch students',
      error: error.message
    });
  }
};

/**
 * Reject user account
 * POST /api/admin/reject-account
 */
exports.rejectAccount = async (req, res) => {
  try {
    // Authorization
    if (!['admin', 'developer', 'assistant'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin, developer, or assistant can reject accounts'
      });
    }

    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID required'
      });
    }

    // ✅ التحقق من صحة المعرف
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }

    console.log(`📝 Attempting to reject user: ${userId}`);

    // ✅ FIXED: Use findById and verify it returns a document
    const user = await User.findById(userId).exec();
    if (!user) {
      console.error(`❌ User not found with ID: ${userId}`);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Hierarchy Check
    const actorRank = roleHierarchy[req.user.role] || 0;
    const targetRank = roleHierarchy[user.role] || 0;

    // Deny if actor has equal or lower rank OR if trying to modify self
    if (actorRank <= targetRank || req.user.id === user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient privileges to modify this user or self-modification is not allowed'
      });
    }

    console.log(`✅ User found: ${user.firstName} ${user.lastName} (Current status: ${user.status})`);

    // ✅ FIXED: Verify user is not already rejected
    if (user.status === 'rejected') {
      console.warn(`⚠️  User already rejected: ${userId}`);
      return res.status(400).json({
        success: false,
        message: 'User is already rejected',
        data: { currentStatus: user.status }
      });
    }

    // Update status
    user.status = 'rejected';
    user.rejectedAt = new Date();
    user.rejectedBy = req.user.id;

    console.log(`💾 Saving user with new status: rejected`);
    const savedUser = await user.save();
    console.log(`✅ User saved successfully. New status: ${savedUser.status}`);

    // ✅ FIXED: Verify the save was actually committed to database
    const verifyUser = await User.findById(userId).exec();
    if (verifyUser.status !== 'rejected') {
      console.error(`❌ VERIFICATION FAILED: User status not updated in database!`);
      console.error(`   Expected: 'rejected', Got: '${verifyUser.status}'`);
      throw new Error('Failed to update user status in database - verification failed');
    }
    console.log(`✅ VERIFICATION PASSED: User status confirmed as 'rejected' in database`);

    // Log action
    await SecurityLog.create({
      type: 'account_rejected',
      userId: user._id,
      userName: `${user.firstName} ${user.lastName}`,
      userRole: user.role,
      message: `Account rejected by ${req.user.role}`,
      description: `Account rejected by ${req.user.role}`,
      severity: 'warning'
    });

    res.status(200).json({
      success: true,
      message: 'Account rejected successfully',
      data: {
        userId: user._id,
        status: user.status,
        rejectedAt: user.rejectedAt
      }
    });
  } catch (error) {
    console.error('❌ Reject account error:', error.message);
    console.error('❌ Stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to reject account',
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
    if (!['admin', 'developer', 'assistant'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin, developer, or assistant can approve accounts'
      });
    }

    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID required'
      });
    }

    // ✅ التحقق من صحة المعرف
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }

    console.log(`📝 Attempting to approve user: ${userId}`);

    // ✅ FIXED: Use findById and verify it returns a document
    const user = await User.findById(userId).exec();
    if (!user) {
      console.error(`❌ User not found with ID: ${userId}`);
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log(`✅ User found: ${user.firstName} ${user.lastName} (Current status: ${user.status})`);

    // ✅ FIXED: Verify user is actually in pending status
    if (user.status === 'approved') {
      console.warn(`⚠️  User already approved: ${userId}`);
      return res.status(400).json({
        success: false,
        message: 'User is already approved',
        data: { currentStatus: user.status }
      });
    }

    // Update status
    user.status = 'approved';
    user.approvedAt = new Date();
    
    // Format the approver's name (e.g., arwa1517 -> arwa)
    let rawIdentifier = req.user.assistantCode || req.user.firstName || 'Admin';
    // Remove numbers and special symbols, keep only letters (English/Arabic)
    let cleanName = rawIdentifier.replace(/[^a-zA-Z\u0600-\u06FF\s]/g, '').trim();
    if (!cleanName) cleanName = 'Admin';

    user.approvedBy = cleanName;

    console.log(`💾 Saving user with new status: approved by ${cleanName}`);
    const savedUser = await user.save();
    console.log(`✅ User saved successfully. New status: ${savedUser.status}`);

    // ✅ FIXED: Verify the save was actually committed to database
    const verifyUser = await User.findById(userId).exec();
    if (verifyUser.status !== 'approved') {
      console.error(`❌ VERIFICATION FAILED: User status not updated in database!`);
      console.error(`   Expected: 'approved', Got: '${verifyUser.status}'`);
      throw new Error('Failed to update user status in database - verification failed');
    }
    console.log(`✅ VERIFICATION PASSED: User status confirmed as 'approved' in database`);

    // Log action
    await SecurityLog.create({
      type: 'account_approved',
      userId: user._id,
      userName: `${user.firstName} ${user.lastName}`,
      userRole: user.role,
      message: `Account approved by ${req.user.role}`,
      description: `Account approved by ${req.user.role}`,
      severity: 'info'
    });

    res.status(200).json({
      success: true,
      message: 'Account approved successfully',
      data: {
        userId: user._id,
        status: user.status,
        approvedAt: user.approvedAt
      }
    });
  } catch (error) {
    console.error('❌ Approve account error:', error.message);
    console.error('❌ Stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to approve account',
      error: error.message
    });
  }
}

/**
 * Block user account
 * POST /api/admin/block-user
 */
exports.blockUser = async (req, res) => {
  try {
    // Authorization
    if (!['admin', 'developer', 'assistant'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin, developer, or assistant can block users'
      });
    }

    const { userId, reason } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID required'
      });
    }

    // ✅ التحقق من صحة المعرف
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Hierarchy Check - ensure requester may modify the target and prevent self-modification
    const actorRank = roleHierarchy[req.user.role] || 0;
    const targetRank = roleHierarchy[user.role] || 0;
    if (actorRank <= targetRank || req.user.id === user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient privileges to modify this user or self-modification is not allowed'
      });
    }

    // ✅ التحقق من أنه ليس مسدود بالفعل
    if (user.status === 'blocked') {
      return res.status(400).json({
        success: false,
        message: 'User is already blocked'
      });
    }

    // ✅ BLOCK = Permanent block (user CANNOT login with same phone anymore)
    user.status = 'blocked';
    user.blockedReason = reason || 'No reason provided';
    user.blockedAt = new Date();
    user.blockedBy = req.user.id;
    const savedUser = await user.save();

    // ✅ التحقق من التحديث
    const verifyUser = await User.findById(userId);
    if (verifyUser.status !== 'blocked') {
      throw new Error('Verification failed: User status not updated in database');
    }

    // Log action
    await SecurityLog.create({
      type: 'user_blocked',
      userId: user._id,
      userName: `${user.firstName} ${user.lastName}`,
      userRole: user.role,
      description: `User PERMANENTLY BLOCKED by ${req.user.role}: ${reason || 'No reason'}`,
      severity: 'error'
    });

    res.status(200).json({
      success: true,
      message: 'User permanently blocked successfully',
      data: {
        userId: savedUser._id,
        status: savedUser.status,
        blockedAt: savedUser.blockedAt,
        blockedReason: savedUser.blockedReason
      }
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
 * Unblock user account (restore to approved)
 * POST /api/admin/unblock-user
 */
exports.unblockUser = async (req, res) => {
  try {
    // Authorization
    if (!['admin', 'developer', 'assistant'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin, developer, or assistant can unblock users'
      });
    }

    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID required'
      });
    }

    // ✅ التحقق من صحة المعرف
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Hierarchy Check
    const actorRank = roleHierarchy[req.user.role] || 0;
    const targetRank = roleHierarchy[user.role] || 0;

    // Deny if actor has equal or lower rank OR if trying to modify self
    if (actorRank <= targetRank || req.user.id === user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient privileges to modify this user or self-modification is not allowed'
      });
    }



    // ✅ التحقق من أن المستخدم مسدود فعلاً
    if (user.status !== 'blocked') {
      return res.status(400).json({
        success: false,
        message: `User is not blocked. Current status: ${user.status}`
      });
    }

    // ✅ UNBLOCK = Remove permanent block (restore to approved status)
    user.status = 'approved';
    user.blockedReason = null;
    user.blockedAt = null;
    user.blockedBy = null;
    const savedUser = await user.save();

    // ✅ التحقق من التحديث
    const verifyUser = await User.findById(userId);
    if (verifyUser.status !== 'approved') {
      throw new Error('Verification failed: User status not updated in database');
    }

    // Log action
    await SecurityLog.create({
      type: 'user_unblocked',
      userId: user._id,
      userName: `${user.firstName} ${user.lastName}`,
      userRole: user.role,
      description: `User UNBLOCKED by ${req.user.role}`,
      severity: 'low'
    });

    res.status(200).json({
      success: true,
      message: 'User unblocked successfully',
      data: {
        userId: savedUser._id,
        status: savedUser.status,
        unblockedAt: new Date()
      }
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

/**
 * Delete user account permanently
 * POST /api/admin/delete-user
 */
exports.deleteUser = async (req, res) => {
  try {
    // Authorization
    if (!['admin', 'developer', 'assistant'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin, developer, or assistant can delete users'
      });
    }

    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID required'
      });
    }

    // ✅ التحقق من صحة المعرف
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Hierarchy Check
    const actorRank = roleHierarchy[req.user.role] || 0;
    const targetRank = roleHierarchy[user.role] || 0;

    // Deny if actor has equal or lower rank OR if trying to modify self
    if (actorRank <= targetRank || req.user.id === user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient privileges to modify this user or self-modification is not allowed'
      });
    }

    // Log the deletion before removing the record
    await SecurityLog.create({
      type: 'account_deleted',
      userId: user._id,
      userName: `${user.firstName} ${user.lastName}`,
      userRole: user.role,
      message: `Account deleted by ${req.user.role}`,
      description: `Account deleted by ${req.user.role}`,
      severity: 'error'
    });

    // Delete the user
    await User.findByIdAndDelete(userId);

    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user',
      error: error.message
    });
  }
};

/**
 * Suspend user account (temporary)
 * POST /api/admin/suspend-user
 */
exports.suspendUser = async (req, res) => {
  try {
    // Authorization
    if (!['admin', 'developer', 'assistant'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin, developer, or assistant can suspend users'
      });
    }

    const { userId, reason } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID required'
      });
    }

    // ✅ التحقق من صحة المعرف
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Hierarchy Check - ensure requester may modify the target and prevent self-modification
    const actorRank = roleHierarchy[req.user.role] || 0;
    const targetRank = roleHierarchy[user.role] || 0;

    if (actorRank <= targetRank || req.user.id === user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient privileges to modify this user or self-modification is not allowed'
      });
    }

    // ✅ التحقق من الحالة الحالية
    if (user.status === 'blocked') {
      return res.status(400).json({
        success: false,
        message: 'Cannot suspend a blocked account. Account is permanently blocked.'
      });
    }

    if (user.status === 'suspended') {
      return res.status(400).json({
        success: false,
        message: 'User is already suspended'
      });
    }

    // ✅ SUSPEND = Temporary suspension (user CAN resume later)
    user.status = 'suspended';
    user.suspensionReason = reason || 'No reason provided';
    user.suspendedAt = new Date();
    user.suspendedBy = req.user.id;
    const savedUser = await user.save();

    // ✅ التحقق من التحديث
    const verifyUser = await User.findById(userId);
    if (verifyUser.status !== 'suspended') {
      throw new Error('Verification failed: User status not updated in database');
    }

    // Log action
    await SecurityLog.create({
      type: 'user_suspended',
      userId: user._id,
      userName: `${user.firstName} ${user.lastName}`,
      userRole: user.role,
      description: `User TEMPORARILY SUSPENDED by ${req.user.role}: ${reason || 'No reason'}`,
      severity: 'medium'
    });

    res.status(200).json({
      success: true,
      message: 'User temporarily suspended successfully',
      data: {
        userId: savedUser._id,
        status: savedUser.status,
        suspendedAt: savedUser.suspendedAt,
        suspensionReason: savedUser.suspensionReason
      }
    });
  } catch (error) {
    console.error('Suspend user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to suspend user',
      error: error.message
    });
  }
};

/**
 * Unsuspend user account (resume)
 * POST /api/admin/unsuspend-user
 */
exports.unsuspendUser = async (req, res) => {
  try {
    // Authorization
    if (!['admin', 'developer', 'assistant'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin, developer, or assistant can unsuspend users'
      });
    }

    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID required'
      });
    }

    // ✅ التحقق من صحة المعرف
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Hierarchy Check - ensure requester may modify the target and prevent self-modification
    const actorRank = roleHierarchy[req.user.role] || 0;
    const targetRank = roleHierarchy[user.role] || 0;
    if (actorRank <= targetRank || req.user.id === user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient privileges to modify this user or self-modification is not allowed'
      });
    }

    // ✅ التحقق من أن المستخدم معلق فعلاً
    if (user.status !== 'suspended') {
      return res.status(400).json({
        success: false,
        message: `User is not suspended. Current status: ${user.status}`
      });
    }

    // ✅ UNSUSPEND = Remove temporary suspension (restore to approved status)
    user.status = 'approved';
    user.suspensionReason = null;
    user.suspendedAt = null;
    user.suspendedBy = null;
    const savedUser = await user.save();

    // ✅ التحقق من التحديث
    const verifyUser = await User.findById(userId);
    if (verifyUser.status !== 'approved') {
      throw new Error('Verification failed: User status not updated in database');
    }

    // Log action
    await SecurityLog.create({
      type: 'user_unsuspended',
      userId: user._id,
      userName: `${user.firstName} ${user.lastName}`,
      userRole: user.role,
      description: `User UNSUSPENDED by ${req.user.role}`,
      severity: 'low'
    });

    res.status(200).json({
      success: true,
      message: 'User unsuspended successfully',
      data: {
        userId: savedUser._id,
        status: savedUser.status,
        unsuspendedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Unsuspend user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to unsuspend user',
      error: error.message
    });
  }
};
