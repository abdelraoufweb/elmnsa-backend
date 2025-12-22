// ==========================================
// ORDER MODEL
// ==========================================

const mongoose = require('mongoose');
const { ORDER_STATUS } = require('../config/constants');

const orderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    unique: true,
    required: true
  },

  // Buyer Info
  buyerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  buyerRole: String,
  buyerName: String,

  // Items
  items: [{
    productId: mongoose.Schema.Types.ObjectId,
    productName: String,
    price: Number,
    quantity: Number,
    category: String
  }],

  // Payment Info
  total: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'EGP'
  },

  // Buyer Contact
  buyerPhone: String,
  buyerEmail: String,
  buyerAddress: String,

  // Status
  status: {
    type: String,
    enum: Object.values(ORDER_STATUS),
    default: ORDER_STATUS.PENDING
  },

  // Tracking
  completedAt: Date,
  completedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  notes: String,

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
orderSchema.index({ orderId: 1 }, { unique: true });
orderSchema.index({ buyerId: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
