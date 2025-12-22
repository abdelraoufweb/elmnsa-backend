// ==========================================
// SECURITY LOG MODEL
// ==========================================

const mongoose = require('mongoose');

const securityLogSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true
    // login, logout, account_block, account_unblock, account_suspend, file_upload, etc
  },
  message: {
    type: String,
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  userName: String,
  userRole: String,

  // Additional context
  data: mongoose.Schema.Types.Mixed,
  ipAddress: String,
  userAgent: String,

  // For tracking actions on other users
  targetUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  targetUserName: String,

  // Severity
  severity: {
    type: String,
    enum: ['info', 'warning', 'error', 'critical'],
    default: 'info'
  },

  createdAt: {
    type: Date,
    default: Date.now,
    expires: 7776000 // Auto-delete after 90 days
  }
});

// Indexes
securityLogSchema.index({ userId: 1, createdAt: -1 });
securityLogSchema.index({ type: 1 });
securityLogSchema.index({ severity: 1 });
securityLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('SecurityLog', securityLogSchema);
