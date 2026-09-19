// ==========================================
// QUESTION MODEL
// ==========================================

const mongoose = require('mongoose');

const choiceSchema = new mongoose.Schema({
  text: {
    type: String,
    required: true,
    trim: true
  },
  isCorrect: {
    type: Boolean,
    required: true,
    default: false
  }
}, { _id: true });

const questionSchema = new mongoose.Schema({
  examId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exam',
    required: true
  },

  // Module number (1 or 2) — used for American exams only.
  // For National exams, this field is ignored (can be null or 1).
  moduleNumber: {
    type: Number,
    enum: [1, 2],
    default: 1
  },

  // How the question was authored:
  // 'text' = written text question, optional supportive image beside it
  // 'image' = the question itself is an image (e.g., scanned from a textbook)
  creationMethod: {
    type: String,
    enum: ['text', 'image'],
    required: true,
    default: 'text'
  },

  // The text of the question (required when creationMethod = 'text')
  questionText: {
    type: String,
    trim: true,
    default: ''
  },

  // Image URL (R2 cloud URL):
  // - For creationMethod='text': optional supportive diagram/figure beside the text
  // - For creationMethod='image': this IS the question (replaces questionText in UI)
  imageUrl: {
    type: String,
    default: null
  },

  // Answer choices (2-6 options)
  choices: {
    type: [choiceSchema],
    validate: {
      validator: function (arr) {
        if (!arr || arr.length < 2) return false;
        // Exactly one correct answer required
        const correctCount = arr.filter(c => c.isCorrect).length;
        return correctCount === 1;
      },
      message: 'Each question must have at least 2 choices and exactly 1 correct answer'
    }
  },

  // Points for this question (National exams only).
  // For American exams this is always ignored — scoring uses the scale table.
  points: {
    type: Number,
    default: 1,
    min: 0
  },

  // Display order within the module/exam
  order: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

questionSchema.index({ examId: 1, moduleNumber: 1, order: 1 });

module.exports = mongoose.model('Question', questionSchema);
