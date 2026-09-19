// ==========================================
// LIVE SESSION MODEL (WebRTC Signaling)
// ==========================================

const mongoose = require('mongoose');

const liveSessionSchema = new mongoose.Schema({
  sessionCode: {
    type: String,
    unique: true,
    required: true
  },
  title: {
    type: String,
    required: true
  },

  // Host
  hostId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  hostRole: String,
  hostName: String,

  // Audience
  audience: {
    type: String,
    default: 'all'
  },

  // Status
  active: {
    type: Boolean,
    default: true
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  endedAt: Date,

  // Participants
  participants: [{
    userId: mongoose.Schema.Types.ObjectId,
    name: String,
    role: String,
    joinedAt: Date,
    leftAt: Date,
    isMuted: Boolean,
    isVideoOff: Boolean
  }],

  // Screen Share
  screenShareBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Recording Info
  recordingUrl: String,
  recordingSize: Number,

  // Zones/Rooms within session
  zones: [{
    zoneId: { type: String, required: true },
    zoneName: { type: String, default: 'Main Room' },
    participants: [{ userId: mongoose.Schema.Types.ObjectId, name: String }],
    maxCapacity: { type: Number, default: 50 },
    createdAt: { type: Date, default: Date.now }
  }],

  // Session settings
  maxParticipants: { type: Number, default: 100 },
  allowRejoin: { type: Boolean, default: true },
  autoRecord: { type: Boolean, default: false },

  createdAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Indexes
liveSessionSchema.index({ sessionCode: 1 }, { unique: true });
liveSessionSchema.index({ active: 1 });
liveSessionSchema.index({ hostId: 1 });
liveSessionSchema.index({ startedAt: -1 });

module.exports = mongoose.model('LiveSession', liveSessionSchema);
