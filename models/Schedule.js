// ==========================================
// SCHEDULE MODEL
// ==========================================

const mongoose = require('mongoose');
const { SCHEDULE_STATUS } = require('../config/constants');

const scheduleSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: String,
  dateTime: {
    type: Date,
    required: true
  },
  location: {
    type: String,
    required: true
  },
  notes: String,

  // Targeting
  curriculum: {
    type: String,
    enum: ['american', 'national'],
    required: true
  },
  grade: {
    type: Number,
    enum: [9, 10, 11, 12],
    required: true
  },

  // Status
  status: {
    type: String,
    enum: Object.values(SCHEDULE_STATUS),
    default: SCHEDULE_STATUS.DRAFT
  },

  // Creator
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdByRole: String,

  // Tracking
  viewedBy: [{
    userId: mongoose.Schema.Types.ObjectId,
    viewedAt: Date
  }],

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Indexes
scheduleSchema.index({ curriculum: 1, grade: 1 });
scheduleSchema.index({ dateTime: 1 });
scheduleSchema.index({ status: 1 });

module.exports = mongoose.model('Schedule', scheduleSchema);
