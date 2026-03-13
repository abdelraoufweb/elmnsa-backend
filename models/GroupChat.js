const mongoose = require('mongoose');
const s = new mongoose.Schema({
  name: { type: String, required: true, minlength: 3, maxlength: 100 },
  description: { type: String, maxlength: 500, default: '' },
  avatar: { type: String, default: null },
  type: { type: String, enum: ['classroom', 'study_group', 'private_group'], default: 'classroom' },
  members: [{
    userId: { type: mongoose.Schema.Types.Mixed, ref: 'User', required: true },
    role: { type: String, enum: ['admin', 'member'], default: 'member' },
    nameColor: { type: String, default: '#000000' },
    displayName: { type: String, default: null },
    joinedAt: { type: Date, default: Date.now },
    isVisible: { type: Boolean, default: true }
  }],
  admins: [{ type: mongoose.Schema.Types.Mixed, ref: 'User' }],
  createdBy: { type: mongoose.Schema.Types.Mixed, ref: 'User', required: true },
  messages: [{
    _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
    senderId: { type: mongoose.Schema.Types.Mixed, ref: 'User', required: true },
    senderName: { type: String, required: true },
    senderDisplayName: { type: String },
    content: { type: String, required: true },
    type: { type: String, enum: ['text', 'image', 'file', 'voice'], default: 'text' },
    createdAt: { type: Date, default: Date.now },
    isEdited: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    editedAt: { type: Date },
    deletedAt: { type: Date }
  }],
  permissions: {
    studentsCanSendImages: { type: Boolean, default: true },
    studentsCanSendFiles: { type: Boolean, default: true },
    studentsCanDeleteMessages: { type: Boolean, default: true },
    studentsCanEditMessages: { type: Boolean, default: true },
    voiceMessagesAllowed: { type: Boolean, default: true }
  },
  messageCount: { type: Number, default: 0 },
  lastMessage: { type: String, default: null },
  lastMessageAt: { type: Date, default: null },
  lastMessageBy: { type: mongoose.Schema.Types.Mixed, ref: 'User', default: null },
  isArchived: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });
s.index({ createdBy: 1, createdAt: -1 });
s.index({ 'members.userId': 1 });
module.exports = mongoose.model('GroupChat', s);
