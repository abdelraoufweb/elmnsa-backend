// ==========================================
// CHAT MESSAGE MODEL
// ==========================================

const mongoose = require('mongoose');
const { MESSAGE_TYPE } = require('../config/constants');

const messageSchema = new mongoose.Schema({
  // Conversation
  threadId: {
    type: String,
    required: true
  },

  // Participants
  fromId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  fromName: String,
  fromRole: String,
  toId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Content
  text: String,
  type: {
    type: String,
    enum: Object.values(MESSAGE_TYPE),
    default: MESSAGE_TYPE.TEXT
  },

  // File (if applicable)
  file: {
    name: String,
    size: Number,
    type: String,
    url: String
  },

  // Status
  status: {
    type: String,
    enum: ['sent', 'delivered', 'read'],
    default: 'sent'
  },
  readAt: Date,

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 2592000 // Auto-delete after 30 days
  }
}, { timestamps: false });

// Indexes
messageSchema.index({ threadId: 1, createdAt: -1 });
messageSchema.index({ fromId: 1 });
messageSchema.index({ toId: 1 });

module.exports = mongoose.model('Message', messageSchema);
