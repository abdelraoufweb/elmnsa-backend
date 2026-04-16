// ==========================================
// ACCESS CODE MODEL (Videos & AI)
// ==========================================

const mongoose = require('mongoose');

const accessCodeSchema = new mongoose.Schema({
  code: {
    type: String,
    unique: true,
    required: true,
    trim: false, // 🎯 IMPORTANT: Don't trim - codes must match exactly
    uppercase: false // 🎯 Case-sensitive codes
  },
  type: {
    type: String,
    enum: [
      'developer',      // Developer account access
      'student',        // Student registration access
      'admin',          // Admin account access
      'assistant',      // Assistant account access
      'parent',         // Parent account access
      'video',          // Video access codes
      'ai',             // AI chat access codes
      'otp'             // One-time password for parents
    ],
    required: true
  },

  // 🎯 NEW: Role and redirect mapping for centralized access control
  role: {
    type: String,
    enum: ['developer', 'admin', 'teacher', 'assistant', 'student', 'parent'],
    required: true
  },
  redirectTo: {
    type: String,
    required: true,
    default: '/dashboard'
  },

  // Restrictions
  maxUsers: Number,
  maxViewsPerUser: Number,
  expiryDate: Date,
  active: {
    type: Boolean,
    default: true
  },

  // Usage Tracking
  currentUsers: {
    type: Number,
    default: 0
  },
  usageByUser: {
    // { userId: { views: 0, unlockedAt: Date } }
    type: Map,
    of: {
      views: Number,
      unlockedAt: Date
    }
  },

  // Scope (for video codes)
  curriculum: String,
  grade: Number,

  // Creator
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes
accessCodeSchema.index({ code: 1 }, { unique: true });
accessCodeSchema.index({ type: 1 });
accessCodeSchema.index({ active: 1 });

module.exports = mongoose.model('AccessCode', accessCodeSchema);
