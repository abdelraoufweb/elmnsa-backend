// ==========================================
// CHAT MESSAGE MODEL
// ==========================================

const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  // Conversation thread
  threadId: {
    type: String,
    required: true
  },

  // Sender
  fromId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  fromName: { type: String, default: '' },
  fromRole: { type: String, default: '' },   // canonical role string: 'student' | 'admin' | 'assistant' | 'developer'

  // Recipient
  toId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  toRole: { type: String, default: '' },

  // Content
  text: { type: String, default: '' },
  type: {
    type: String,
    enum: ['text', 'file', 'image', 'system'],
    default: 'text'
  },

  // File attachment (optional)
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
  read: { type: Boolean, default: false },
  readAt: { type: Date }

}, {
  timestamps: true   // adds createdAt + updatedAt automatically
});

// Auto-delete messages after 30 days
messageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

// Query performance indexes
messageSchema.index({ threadId: 1, createdAt: -1 });
messageSchema.index({ fromId: 1 });
messageSchema.index({ toId: 1 });
messageSchema.index({ toId: 1, read: 1 });

// Virtual to maintain backward-compatibility with code expecting `from` field
messageSchema.virtual('from')
  .get(function() {
    return this.fromRole;
  })
  .set(function(value) {
    this.fromRole = value;
  });

module.exports = mongoose.model('Message', messageSchema);
