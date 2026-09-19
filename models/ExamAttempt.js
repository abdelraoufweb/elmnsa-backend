// ==========================================
// EXAM ATTEMPT MODEL
// ==========================================

const mongoose = require('mongoose');

// Stores an individual module submission from a student
const moduleSubmissionSchema = new mongoose.Schema({
  moduleNumber: { type: Number, enum: [1, 2], required: true },
  // Map of questionId → chosen choiceId (or null if skipped)
  answers: {
    type: Map,
    of: String  // questionId -> choiceId string (or 'null' if skipped)
  },
  rawScore: { type: Number, default: 0 },      // number of correct answers in this module
  totalQuestions: { type: Number, default: 0 },
  submittedAt: { type: Date, default: Date.now }
}, { _id: false });

const examAttemptSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  examId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exam',
    required: true
  },

  // The exam access code that was used to start this attempt
  accessCodeUsed: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExamAccessCode',
    required: true
  },

  // 1 = first attempt, 2 = retake (max 2 per code)
  attemptNumber: {
    type: Number,
    enum: [1, 2],
    required: true
  },

  // Submitted modules and their individual scores
  moduleSubmissions: [moduleSubmissionSchema],

  // How many modules the student completed (1 or 2)
  modulesCompleted: {
    type: Number,
    enum: [0, 1, 2],
    default: 0
  },

  // Combined raw score across all submitted modules
  rawScore: {
    type: Number,
    default: 0
  },

  // Final displayed score:
  // - National: sum of points for correct answers
  // - American: raw score mapped to 200-800 via the exam's scale table
  finalScore: {
    type: Number,
    default: 0
  },

  // Maximum possible score for this attempt:
  // - National: sum of all question points
  // - American: 800
  maxScore: {
    type: Number,
    default: 0
  },

  // Status of this attempt
  status: {
    type: String,
    enum: ['in_progress', 'module1_done', 'completed'],
    default: 'in_progress'
  },

  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date, default: null },

  // Score visibility window: 7 days after completion
  visibleUntil: { type: Date, default: null }
}, { timestamps: true });

// ──────────────────────────────────────────────────────────
// EXAM RESULT MODEL
// ──────────────────────────────────────────────────────────
// Stores the aggregated best result for a student per exam per code.
// When a student has 2 attempts, this holds the highest finalScore.
// This is what the student's grade card shows.

const examResultSchema = new mongoose.Schema({
  studentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  examId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exam',
    required: true
  },

  accessCodeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ExamAccessCode',
    required: true
  },

  // The highest finalScore across both attempts
  bestScore: {
    type: Number,
    default: 0
  },

  maxScore: {
    type: Number,
    default: 0
  },

  // Which attempt produced the best score (for reference)
  bestAttemptNumber: {
    type: Number,
    enum: [1, 2]
  },

  totalAttempts: {
    type: Number,
    default: 1
  },

  // Mirrors visibleUntil from the latest attempt (last completedAt + 7 days)
  visibleUntil: {
    type: Date,
    required: true
  },

  // Exam type (denormalized for easy filtering)
  examType: {
    type: String,
    enum: ['national', 'american']
  },

  examTitle: String,
  examStage: Number
}, { timestamps: true });

examAttemptSchema.index({ studentId: 1, examId: 1 });
examAttemptSchema.index({ accessCodeUsed: 1 });
examResultSchema.index({ studentId: 1, visibleUntil: 1 });
examResultSchema.index({ accessCodeId: 1 });

const ExamAttempt = mongoose.model('ExamAttempt', examAttemptSchema);
const ExamResult  = mongoose.model('ExamResult', examResultSchema);

module.exports = { ExamAttempt, ExamResult };
