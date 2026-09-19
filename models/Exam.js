// ==========================================
// EXAM MODEL
// ==========================================

const mongoose = require('mongoose');

// Scaling table for American exams: maps rawScore (0-44) to scaledScore (200-800)
// This is stored per-exam so it can be customized per exam without code changes.
// Default table distributes scores roughly linearly with some curve at the top.
const DEFAULT_AMERICAN_SCALE = (() => {
  const table = {};
  for (let raw = 0; raw <= 44; raw++) {
    // Rough approximation of a scaled 200-800 range
    // Bottom quarter (0-11): 200-400
    // Middle half (12-33): 400-700
    // Top quarter (34-44): 700-800
    let scaled;
    if (raw <= 11) {
      scaled = Math.round(200 + (raw / 11) * 200);
    } else if (raw <= 33) {
      scaled = Math.round(400 + ((raw - 12) / 21) * 300);
    } else {
      scaled = Math.round(700 + ((raw - 34) / 10) * 100);
    }
    // Clamp to 200-800 and round to nearest 10
    table[raw] = Math.min(800, Math.max(200, Math.round(scaled / 10) * 10));
  }
  return table;
})();

const examSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },

  // Grade/stage (9, 10, 11, 12)
  stage: {
    type: Number,
    enum: [9, 10, 11, 12],
    required: true
  },

  // national: admin sets points per question, total is summed
  // american: 22 questions per module, 200-800 scaled scoring
  type: {
    type: String,
    enum: ['national', 'american'],
    required: true
  },

  status: {
    type: String,
    enum: ['draft', 'active', 'disabled'],
    default: 'draft'
  },

  // For American exams: configurable raw→scaled mapping table
  // Key: raw score (string "0"-"44"), Value: scaled score (200-800)
  americanScaleTable: {
    type: Map,
    of: Number,
    default: () => new Map(Object.entries(DEFAULT_AMERICAN_SCALE))
  },

  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, { timestamps: true });

// Virtual: totalPoints (National only — sum of question points)
// This is computed on demand, not stored, since questions are separate documents.

examSchema.index({ stage: 1, type: 1, status: 1 });
examSchema.index({ createdBy: 1 });

module.exports = mongoose.model('Exam', examSchema);
