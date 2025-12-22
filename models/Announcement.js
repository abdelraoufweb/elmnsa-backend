// ==========================================
// ANNOUNCEMENT MODEL
// ==========================================

const mongoose = require('mongoose');
const { NOTIFICATION_TYPE } = require('../config/constants');

const announcementSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'medium', 'high'],
    default: 'normal'
  },

  // Targeting
  target: {
    type: String,
    default: 'all'
    // Can be: 'all', 'parents', 'american', 'national', 'grade9', 'grade10', etc
  },

  // Creator
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdByRole: String,

  // Read Tracking
  readBy: [{
    userId: mongoose.Schema.Types.ObjectId,
    readAt: Date
  }],

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Indexes
announcementSchema.index({ createdAt: -1 });
announcementSchema.index({ target: 1 });

module.exports = mongoose.model('Announcement', announcementSchema);
