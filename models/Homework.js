// ==========================================
// HOMEWORK MODEL
// ==========================================

const mongoose = require('mongoose');
const { HOMEWORK_STATUS } = require('../config/constants');

const homeworkSchema = new mongoose.Schema({
  // Student Info
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  studentName: String,
  studentGrade: Number,
  curriculum: String,

  // File Info
  fileName: {
    type: String,
    required: true
  },
  fileSize: Number,
  fileType: String,
  fileUrl: {
    type: String,
    required: true
  },

  // Submission
  notes: String,
  status: {
    type: String,
    enum: Object.values(HOMEWORK_STATUS),
    default: HOMEWORK_STATUS.PENDING
  },
  submittedAt: {
    type: Date,
    default: Date.now
  },

  // Grading
  grade: String, // A+, B, 90%, etc
  feedback: String,
  gradedAt: Date,
  gradedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  gradedByRole: String,

  // Tracking
  viewedBy: [{
    userId: mongoose.Schema.Types.ObjectId,
    viewedAt: Date
  }],

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
homeworkSchema.index({ studentId: 1 });
homeworkSchema.index({ status: 1 });
homeworkSchema.index({ submittedAt: -1 });

module.exports = mongoose.model('Homework', homeworkSchema);
