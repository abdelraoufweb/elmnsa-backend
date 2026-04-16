// ==========================================
// USER MODEL (All User Types)
// ==========================================

const mongoose = require('mongoose');
const { ACCOUNT_STATUS, ROLES } = require('../config/constants');

const userSchema = new mongoose.Schema({
  // Basic Info
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  middleName: {
    type: String,
    default: ''
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  phoneNumber: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true,
    select: false
  },
  pushSubscriptions: [{
    endpoint: String,
    keys: {
      p256dh: String,
      auth: String
    },
    deviceType: String,
    _id: false
  }],

  // Role & Status
  role: {
    type: String,
    enum: Object.values(ROLES),
    default: ROLES.STUDENT
  },
  status: {
    type: String,
    enum: Object.values(ACCOUNT_STATUS),
    default: ACCOUNT_STATUS.PENDING
  },

  // Student Specific
  grade: {
    type: Number,
    enum: [9, 10, 11, 12]
  },
  curriculum: {
    type: String,
    enum: ['american', 'national']
  },
  parentPhone: String,
  schoolName: String,

  // Parent Specific
  childrenIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],

  // Assistant Specific
  assistantCode: String,
  assignedStudents: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],

  // Media
  photoURL: String,

  // Access & Features
  videoAccessUnlocked: {
    type: Boolean,
    default: false
  },
  videoAccessCode: String,
  aiAccessUnlocked: {
    type: Boolean,
    default: false
  },
  aiAccessCode: String,

  // Device & Phone Management (for students)
  approvedDevices: [{
    deviceId: String,              // UUID or fingerprint
    deviceName: String,            // e.g., "iPhone 12"
    phoneNumber: String,           // Phone number of device
    approvedAt: Date,              // When device was approved
    approvedBy: String,            // Admin/Assistant who approved
    lastUsedAt: Date,              // Last login from this device
    _id: false
  }],
  currentDeviceId: String,         // Currently used device
  requireDeviceApproval: {
    type: Boolean,
    default: true                  // Only for students
  },
  deviceApprovalNotes: String,     // Notes from admin/assistant

  // Account Management
  approvedAt: Date,
  approvedBy: String,
  rejectedAt: Date,           // ✅ FIXED: Add rejectedAt field
  rejectedBy: String,         // ✅ FIXED: Add rejectedBy field
  blockedAt: Date,
  blockedReason: String,      // ✅ FIXED: Changed from blockReason to blockedReason
  blockedBy: String,
  suspendedAt: Date,
  suspensionReason: String,
  suspendedBy: String,

  // Activity Tracking
  lastLoginAt: Date,
  lastActivityAt: Date,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },

  // Security
  securityLogs: [{
    type: String,
    _id: false
  }],

  isOnline: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true }
});

// Indexes for performance
userSchema.index({ phoneNumber: 1 }, { unique: true });
userSchema.index({ role: 1 });
userSchema.index({ status: 1 });
userSchema.index({ grade: 1, curriculum: 1 });
userSchema.index({ assistantCode: 1 });

// Virtual: Full Name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.middleName ? this.middleName + ' ' : ''}${this.lastName}`;
});

// Pre-save: Update updatedAt
userSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Method: Check if user has permission
userSchema.methods.hasPermission = function(permission) {
  const { PERMISSIONS } = require('../config/constants');
  if (this.role === ROLES.DEVELOPER) return true;
  const rolePerms = PERMISSIONS[this.role] || [];
  return rolePerms.includes(permission);
};

// Method: Is Account Active
userSchema.methods.isAccountActive = function() {
  return this.status === ACCOUNT_STATUS.APPROVED;
};

// Method: Can Access Feature
userSchema.methods.canAccessFeature = function(feature) {
  if (!this.isAccountActive()) return false;
  if (feature === 'videos') return this.videoAccessUnlocked || this.role !== ROLES.STUDENT;
  if (feature === 'ai') return this.aiAccessUnlocked || this.role !== ROLES.STUDENT;
  return true;
};

// Prevent password from being returned by default
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.password;
    return ret;
  }
});

module.exports = mongoose.model('User', userSchema);
