// ==========================================
// VIDEO MODEL
// ==========================================

const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  youtubeUrl: {
    type: String,
    default: null
  },
  youtubeId: String,

  // 🎬 NEW: MP4 Video Support
  mp4Url: {
    type: String,
    default: null
  },
  mp4Path: {
    type: String,
    default: null // Path on server if uploaded
  },
  supportedQualities: {
    type: [String],
    enum: ['360p', '480p', '720p', '1080p'],
    default: ['720p']
  },
  defaultQuality: {
    type: String,
    enum: ['360p', '480p', '720p', '1080p'],
    default: '720p'
  },

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
  accessCode: String,
  isPublic: {
    type: Boolean,
    default: false
  },
  maxViewsPerUser: Number,
  expiryDate: Date,

  // Statistics
  views: {
    type: Number,
    default: 0
  },
  ratings: [{
    userId: mongoose.Schema.Types.ObjectId,
    rating: Number,
    comment: String,
    createdAt: Date
  }],

  // Metadata
  duration: Number, // in seconds
  thumbnail: String,

  // Creator Info
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdByRole: String,

  // Status
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'published'
  },

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
videoSchema.index({ curriculum: 1, grade: 1 });
videoSchema.index({ createdBy: 1 });
videoSchema.index({ youtubeId: 1 });

// Pre-save: Validation & Extract YouTube ID
videoSchema.pre('save', function (next) {
  // 🎯 Ensure either YouTube OR MP4 is provided
  if (!this.youtubeUrl && !this.mp4Url) {
    return next(new Error('Either youtubeUrl or mp4Url must be provided'));
  }

  // Extract YouTube ID if URL is provided
  if (!this.youtubeId && this.youtubeUrl) {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s?]+)/,
      /^([a-zA-Z0-9_-]{11})$/
    ];
    for (const pattern of patterns) {
      const match = this.youtubeUrl.match(pattern);
      if (match) {
        this.youtubeId = match[1];
        break;
      }
    }
  }

  next();
});

// Calculate average rating
videoSchema.virtual('averageRating').get(function () {
  if (this.ratings.length === 0) return 0;
  const sum = this.ratings.reduce((acc, r) => acc + r.rating, 0);
  return Math.round((sum / this.ratings.length) * 10) / 10;
});

module.exports = mongoose.model('Video', videoSchema);
