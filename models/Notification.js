// ==========================================
// NOTIFICATION MODEL
// ==========================================

const mongoose = require('mongoose');
const secondaryDb = require('../services/secondaryDb');
const { NOTIFICATION_TYPE } = require('../config/constants');

const notificationSchema = new mongoose.Schema({
  // Recipient
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Content
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: Object.values(NOTIFICATION_TYPE),
    default: NOTIFICATION_TYPE.SYSTEM
  },

  // Reference
  refId: String, // announcement ID, order ID, etc

  // Status
  read: {
    type: Boolean,
    default: false
  },
  readAt: Date,

  // Creator (optional)
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  createdAt: {
    type: Date,
    default: Date.now,
    expires: 2592000 // Auto-delete after 30 days
  }
});

// Indexes
notificationSchema.index({ recipientId: 1, createdAt: -1 });
notificationSchema.index({ read: 1 });

module.exports = secondaryDb.model('Notification', notificationSchema);
