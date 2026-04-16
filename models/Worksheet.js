// ==========================================
// WORKSHEET MODEL
// ==========================================

const mongoose = require('mongoose');

const worksheetSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },

  // File Info
  fileUrl: String,
  fileType: String,
  fileSize: Number,

  // External Link (alternative to file)
  link: String,

  // Metadata
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

  // Access Control
  isPublic: {
    type: Boolean,
    default: false
  },

  // Stats
  views: {
    type: Number,
    default: 0
  },
  downloads: {
    type: Number,
    default: 0
  },

  // Creator
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdByRole: String,

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
worksheetSchema.index({ curriculum: 1, grade: 1 });
worksheetSchema.index({ createdBy: 1 });

module.exports = mongoose.model('Worksheet', worksheetSchema);
