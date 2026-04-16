const mongoose = require('mongoose');

const profileRequestSchema = new mongoose.Schema({
    studentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    studentName: String,
    requestedChanges: {
        type: Object, // Stores { firstName: '...', phoneNumber: '...' } etc.
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
    },
    adminNote: String,
    reviewedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    reviewedByRole: String,
    reviewedAt: Date
}, { timestamps: true });

// efficient queries
profileRequestSchema.index({ status: 1 });
profileRequestSchema.index({ studentId: 1 });

module.exports = mongoose.model('ProfileRequest', profileRequestSchema);
