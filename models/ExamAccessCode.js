// ==========================================
// EXAM ACCESS CODE MODEL
// ==========================================

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const examAccessCodeSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    trim: false // codes must match exactly, no trimming
  },

  // ── Sold status ──────────────────────────────────────────
  // Set once by admin/assistant when the code is sold to a student.
  // NEVER reversed — used for accurate "codes sold" statistics.
  isSold: {
    type: Boolean,
    default: false
  },
  soldAt: {
    type: Date,
    default: null
  },

  // ── Usage tracking ───────────────────────────────────────
  isUsed: {
    type: Boolean,
    default: false
  },
  usedAt: {
    type: Date,
    default: null
  },
  usedByStudentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  usedByStudentName: {
    type: String,  // denormalized for fast admin display
    default: null
  },

  // The exam this code is locked to (null until first use)
  lockedToExamId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exam',
    default: null
  },

  // How many attempts have been made (0, 1, or 2)
  attemptCount: {
    type: Number,
    default: 0,
    min: 0,
    max: 2
  },

  // ── Stop access ──────────────────────────────────────────
  // Manual disable by admin — prevents further use regardless of attemptCount
  isDisabled: {
    type: Boolean,
    default: false
  },
  disabledAt: {
    type: Date,
    default: null
  },
  disabledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  // ── Batch tracking ───────────────────────────────────────
  // UUID assigned to a generation batch.
  // All codes from a single "Generate N codes" action share the same batchId.
  generationBatchId: {
    type: String,
    required: true,
    default: () => uuidv4()
  },

  // Set to true after the batch PDF is exported, as a visual reminder
  // to admin/assistant that this code was already included in a PDF export.
  savedInPdf: {
    type: Boolean,
    default: false
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, { timestamps: true });

examAccessCodeSchema.index({ code: 1 }, { unique: true });
examAccessCodeSchema.index({ generationBatchId: 1 });
examAccessCodeSchema.index({ lockedToExamId: 1 });
examAccessCodeSchema.index({ isUsed: 1, isDisabled: 1 });
examAccessCodeSchema.index({ isSold: 1 });

module.exports = mongoose.model('ExamAccessCode', examAccessCodeSchema);
