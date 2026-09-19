// ==========================================
// KNOWLEDGE FILE MODEL
// ==========================================
// Stores teaching material (.md/.txt) for the AI Teacher
// Organized by grade, curriculum, lesson, and global skills

const mongoose = require('mongoose');

const knowledgeFileSchema = new mongoose.Schema({
  // File metadata
  title: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    required: true
  },
  fileType: {
    type: String,
    enum: ['md', 'txt'],
    default: 'txt'
  },

  // Categorization
  grade: {
    type: Number,
    enum: [9, 10, 11, 12],
    default: null
  },
  curriculum: {
    type: String,
    enum: ['american', 'national'],
    default: null
  },
  lessonName: {
    type: String,
    trim: true,
    default: ''
  },
  lessonsList: [{
    type: String,
    trim: true,
    _id: false
  }],

  // Global skill flag — shared across all grades/curricula
  isGlobal: {
    type: Boolean,
    default: false
  },

  // Management
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
knowledgeFileSchema.index({ grade: 1, curriculum: 1 });
knowledgeFileSchema.index({ isGlobal: 1 });
knowledgeFileSchema.index({ active: 1 });

module.exports = mongoose.model('KnowledgeFile', knowledgeFileSchema);
