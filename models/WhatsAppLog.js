// ==========================================
// WHATSAPP MESSAGE LOG MODEL
// ==========================================
// Tracks every WhatsApp message sent by the system.
// Used for reporting, debugging, and duplicate prevention.

const mongoose = require('mongoose');
const secondaryDb = require('../services/secondaryDb');

const whatsAppLogSchema = new mongoose.Schema({
  // Message classification
  type: {
    type: String,
    enum: ['content', 'grade', 'approval', 'report', 'registration', 'chat_alert', 'announcement'],
    required: true
  },

  // Recipient details
  recipientPhone: {
    type: String,
    required: true
  },
  recipientName: {
    type: String,
    default: 'Unknown'
  },
  recipientType: {
    type: String,
    enum: ['student', 'parent', 'admin', 'assistant'],
    default: 'student'
  },

  // Linked student (if applicable)
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  // Message content
  messageBody: {
    type: String,
    required: true
  },

  // Delivery status
  status: {
    type: String,
    enum: ['queued', 'sent', 'failed', 'retrying'],
    default: 'queued'
  },
  errorMessage: {
    type: String,
    default: null
  },

  // Retry tracking
  retryCount: {
    type: Number,
    default: 0
  },
  maxRetries: {
    type: Number,
    default: 1
  },

  // Reporting flag
  reported: {
    type: Boolean,
    default: false
  },
  reportedAt: {
    type: Date,
    default: null
  },

  // Deduplication key (prevents sending same message twice)
  deduplicationKey: {
    type: String,
    index: true,
    sparse: true
  },

  // Which session sent this message (multi-session tracking)
  sessionId: {
    type: String,
    default: null
  },

  // Timestamps
  timestamp: {
    type: Date,
    default: Date.now
  },
  sentAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Indexes for fast queries
whatsAppLogSchema.index({ type: 1, timestamp: -1 });
whatsAppLogSchema.index({ status: 1 });
whatsAppLogSchema.index({ reported: 1, timestamp: -1 });
whatsAppLogSchema.index({ recipientPhone: 1, timestamp: -1 });
whatsAppLogSchema.index({ studentId: 1 });

module.exports = secondaryDb.model('WhatsAppLog', whatsAppLogSchema);
