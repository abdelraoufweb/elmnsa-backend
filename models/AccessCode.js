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
  aiPermissions: {
    type: String,
    enum: ['chat', 'voice', 'both'],
    default: 'both' // Default to both for backwards compatibility
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

  // 🎯 NEW: Duration based on first use
  durationDays: Number, // e.g., valid for 3 days after first use
  activatedAt: Date,    // the exact date it was first used (if durationDays is set)

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
  linkedResource: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Video'
  },

  // ── Sold tracking (for video codes) ─────────────────────
  // Marked once by admin/assistant when code is sold to a student.
  // Never reversed — used for accurate sold count statistics.
  isSold: {
    type: Boolean,
    default: false
  },
  soldAt: {
    type: Date,
    default: null
  },

  // ── Usage tracking (who used this code) ──────────────────
  // Populated automatically when a student successfully uses the code.
  usedByStudentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  usedByStudentName: {
    type: String,  // denormalized for fast display in admin panel
    default: null
  },

  // ── Batch tracking ────────────────────────────────────────
  // UUID shared by all codes generated in the same batch action.
  // Enables grouping, pagination, and batch PDF export.
  generationBatchId: {
    type: String,
    default: null
  },

  // Set to true after the batch is exported to PDF — visual reminder
  // to admin/assistant that this code was already included in a PDF.
  savedInPdf: {
    type: Boolean,
    default: false
  },

  // ── User binding (for parent/assistant codes) ─────────────
  // When set, this code is bound to exactly one User account.
  // authController.verifyAccessCode uses this to issue that user's
  // real JWT instead of doing a role-based lookup (which caused the
  // account-sharing bug fixed in Session 1 / 2026-09-11).
  linkedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

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
