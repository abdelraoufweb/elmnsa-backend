// ==========================================
// PRODUCT MODEL (Store)
// ==========================================

const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    default: 'EGP'
  },

  // Categorization
  category: {
    type: String,
    enum: ['books', 'worksheets', 'tools', 'subscriptions'],
    required: true
  },

  // Media
  imageUrl: String,
  purchaseLink: String,

  // Stats
  views: {
    type: Number,
    default: 0
  },
  purchases: {
    type: Number,
    default: 0
  },
  ratings: [{
    userId: mongoose.Schema.Types.ObjectId,
    rating: Number,
    comment: String,
    createdAt: Date
  }],

  // Creator
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdByRole: String,

  // Timeline
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
productSchema.index({ category: 1 });
productSchema.index({ createdBy: 1 });

// Virtual: Average Rating
productSchema.virtual('averageRating').get(function() {
  if (!this.ratings || this.ratings.length === 0) return 0;
  const sum = this.ratings.reduce((acc, r) => acc + r.rating, 0);
  return Math.round((sum / this.ratings.length) * 10) / 10;
});

module.exports = mongoose.model('Product', productSchema);
