// ==========================================
// THEME MODEL - User-Specific Themes
// ==========================================

const mongoose = require('mongoose');

const themeSchema = new mongoose.Schema({
  // User this theme belongs to
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },

  // Theme name
  themeName: {
    type: String,
    enum: [
      'default',
      'theme-dark',
      'theme-light',
      'theme-ocean',
      'theme-sunset',
      'theme-purple',
      'theme-forest',
      'assistant-theme'
    ],
    default: 'theme-dark'
  },

  // Who applied it
  appliedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  appliedByRole: {
    type: String,
    enum: ['admin', 'developer', 'assistant', 'student', 'user'],
    default: 'user'
  },

  // Timestamps
  appliedAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Indexes
themeSchema.index({ userId: 1 });
themeSchema.index({ appliedBy: 1 });

// Pre-save: Update updatedAt
themeSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Theme', themeSchema);
