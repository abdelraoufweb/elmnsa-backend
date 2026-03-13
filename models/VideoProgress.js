const mongoose = require('mongoose');

const videoProgressSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    video: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Video',
        required: true
    },
    progress: {
        type: Number, // In seconds
        default: 0
    },
    completed: {
        type: Boolean,
        default: false
    },
    lastWatched: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

// Compound index to ensure one progress record per user per video
videoProgressSchema.index({ user: 1, video: 1 }, { unique: true });

module.exports = mongoose.model('VideoProgress', videoProgressSchema);
