// ==========================================
// MESSAGE CONTROLLER
// ==========================================

const mongoose = require('mongoose');
const Message = require('../models/Message');
const User = require('../models/User');

const MAX_LIMIT = parseInt(process.env.MESSAGE_MAX_LIMIT || '1000', 10);
const DEFAULT_LIMIT = 50;
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_BYTES || String(10 * 1024 * 1024), 10); // 10MB

// ──────────────────────────────────────────
// POST /api/messages/send
// ──────────────────────────────────────────
exports.sendMessage = async (req, res) => {
  try {
    const { toId, text, threadId, file } = req.body;

    // ── Auth guard ──────────────────────────
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }

    // ── Input validation ─────────────────────
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ success: false, message: 'Message text is required.' });
    }

    // ── Resolve recipient ────────────────────
    let recipientId = toId;

    const isRole = !toId || ['assistant', 'admin', 'developer', 'student'].includes(toId);

    if (isRole) {
      if (req.user.role === 'student') {
        // Student → find any support staff
        // Student → find a random support staff for load balancing
        const staffCount = await User.countDocuments({
          role: { $in: ['admin', 'assistant', 'developer'] }
        });

        const randomSkip = Math.floor(Math.random() * Math.max(staffCount, 1));
        const staff = await User.findOne({
          role: { $in: ['admin', 'assistant', 'developer'] }
        }).skip(randomSkip).lean();

        if (!staff) {
          return res.status(404).json({ success: false, message: 'No support agents available.' });
        }
        recipientId = staff._id;

      } else if (['admin', 'assistant', 'developer'].includes(req.user.role)) {
        // Staff → extract student from threadId  (format: "chat:<studentId>")
        if (threadId && threadId.startsWith('chat:')) {
          const studentId = threadId.replace('chat:', '').trim();
          if (/^[0-9a-fA-F]{24}$/.test(studentId)) {
            recipientId = studentId;
          } else {
            return res.status(400).json({
              success: false,
              message: 'Invalid threadId format. Expected "chat:<mongoObjectId>".'
            });
          }
        } else {
          return res.status(400).json({
            success: false,
            message: 'threadId is required when sending to a student.'
          });
        }
      }
    }

    // ── Role guard ───────────────────────────
    const allowed = ['admin', 'assistant', 'developer', 'student'];
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Your role cannot send messages.' });
    }

    // ── Verify recipient exists ──────────────
    let recipient = await User.findById(recipientId).lean();
    if (!recipient) {
      // 🎯 MODIFICATION: Allow sending to roles or known virtual IDs
      // Check if the recipientId matches a known staff role or is a virtual staff ID
      if (['admin', 'assistant', 'developer'].includes(toId)) {
        recipient = { role: toId, firstName: 'Staff', lastName: 'Member' };
      } else if (recipientId && recipientId.toString().length === 24) {
        // Assume it might be a guest staff member
        recipient = { role: 'assistant', firstName: 'Staff', lastName: 'Member' };
      } else {
        return res.status(404).json({ success: false, message: 'Recipient not found.' });
      }
    }

    // ── Build thread ID ──────────────────────
    const resolvedThreadId = threadId ||
      (req.user.role === 'student'
        ? `chat:${req.user.id}`
        : `chat:${recipientId}`);

    // ── Create & save message ────────────────
    const senderName = [req.user.firstName, req.user.lastName].filter(Boolean).join(' ') || req.user.role;

    // Sanitize file object if present
    let safeFile = null;
    if (file && typeof file === 'object') {
      const { url, name, size, mimeType } = file;
      if (typeof url === 'string' && typeof name === 'string' && typeof mimeType === 'string' && typeof size === 'number') {
        if (size <= MAX_FILE_SIZE) {
          safeFile = { url: url.trim(), name: name.trim(), size, mimeType: mimeType.trim() };
        } else {
          return res.status(400).json({ success: false, message: 'File too large' });
        }
      } else {
        return res.status(400).json({ success: false, message: 'Invalid file object' });
      }
    }

    const message = new Message({
      text: text.trim(),
      type: file ? 'file' : 'text',
      from: req.user.role,
      fromRole: req.user.role,
      fromId: req.user.id,
      fromName: senderName,
      toId: recipientId,
      toRole: recipient.role,
      threadId: resolvedThreadId,
      status: 'delivered',
      read: false,
      ...(safeFile ? { file: safeFile } : {})
    });

    await message.save();

    // ── Real-time push via Socket.IO ─────────
    const payload = {
      id: message._id,
      text: message.text,
      from: message.from,
      fromId: message.fromId,
      fromName: message.fromName,
      toId: message.toId,
      threadId: message.threadId,
      createdAt: message.createdAt,
      status: message.status,
      file: message.file || null
    };

    if (req.io) {
      // Emit only to the thread room to avoid global broadcasts
      req.io.to(resolvedThreadId).emit('new_message', payload);
    }

    return res.status(201).json({
      success: true,
      message: 'Message sent successfully.',
      data: payload
    });

  } catch (error) {
    console.error('❌ [sendMessage] Error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to send message.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ──────────────────────────────────────────
// GET /api/messages?threadId=chat:id&page=1&limit=20
// ──────────────────────────────────────────
exports.getMessages = async (req, res) => {
  try {
    const { threadId, page = 1, limit = DEFAULT_LIMIT } = req.query;

    const query = {
      $or: [
        { fromId: req.user.id },
        { toId: req.user.id }
      ]
    };

    if (threadId) query.threadId = threadId;

    // Staff can see all threads in their view
    if (['admin', 'developer', 'assistant'].includes(req.user.role) && threadId) {
      delete query.$or;
      query.threadId = threadId;
    }

    // Parse and clamp limit
    let parsedLimit = parseInt(limit, 10);
    if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) parsedLimit = DEFAULT_LIMIT;
    parsedLimit = Math.min(parsedLimit, MAX_LIMIT);
    const skip = (Number(page) - 1) * parsedLimit;
    const total = await Message.countDocuments(query);

    const messages = await Message
      .find(query)
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(parsedLimit)
      .populate('fromId', 'firstName lastName role')
      .populate('toId', 'firstName lastName role')
      .lean();

    return res.json({
      success: true,
      data: messages,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / Number(limit))
      }
    });

  } catch (error) {
    console.error('❌ [getMessages] Error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch messages.' });
  }
};

// ──────────────────────────────────────────
// GET /api/messages/:threadId
// ──────────────────────────────────────────
exports.getThreadMessages = async (req, res) => {
  try {
    const { threadId } = req.params;
    const userId = String(req.user.id);

    // Participants check: derive explicit participant ids from threadId
    let participants = [];
    if (typeof threadId === 'string' && threadId.includes(':')) {
      participants = threadId.split(':').map(p => p.trim()).filter(Boolean);
    } else if (typeof threadId === 'string') {
      participants = [threadId.trim()];
    }

    const isParticipant = participants.includes(userId) || ['admin', 'developer', 'assistant'].includes(req.user.role);
    if (!isParticipant) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const messages = await Message
      .find({ threadId })
      .sort({ createdAt: 1 })
      .populate('fromId', 'firstName lastName role')
      .populate('toId', 'firstName lastName role')
      .lean();

    return res.json({ success: true, data: messages, count: messages.length });

  } catch (error) {
    console.error('❌ [getThreadMessages] Error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch thread.' });
  }
};

// ──────────────────────────────────────────
// GET /api/messages/threads  (all threads for staff)
// ──────────────────────────────────────────
exports.getAllThreads = async (req, res) => {
  try {
    if (!['admin', 'developer', 'assistant'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Staff only.' });
    }

    // Get unique threads with latest message and unread count
    const threads = await Message.aggregate([
      // 1. Sort by date ascending so $last gets newest
      { $sort: { createdAt: 1 } },
      // 2. Group by threadId
      {
        $group: {
          _id: '$threadId',
          lastText: { $last: '$text' },
          lastAt: { $last: '$createdAt' },
          // Count unread messages where this user is the recipient
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$read', false] },
                    { $eq: ['$toId', new mongoose.Types.ObjectId(req.user.id)] }
                  ]
                }, 1, 0
              ]
            }
          },
          // Find the student ID based on thread name "chat:<studentId>"
          studentIdRaw: { $last: '$threadId' }
        }
      },
      // 3. Extract studentId from string "chat:<id>"
      {
        $addFields: {
          studentIdStr: { $trim: { input: { $arrayElemAt: [{ $split: ["$_id", "chat:"] }, 1] } } }
        }
      },
      // 4. Convert to ObjectId if valid
      {
        $addFields: {
          studentIdObj: {
            $cond: [
              { $regexMatch: { input: "$studentIdStr", regex: /^[0-9a-fA-F]{24}$/ } },
              { $toObjectId: "$studentIdStr" },
              null
            ]
          }
        }
      },
      // 5. Lookup student details
      {
        $lookup: {
          from: 'users',
          localField: 'studentIdObj',
          foreignField: '_id',
          as: 'student'
        }
      },
      { $unwind: { path: '$student', preserveNullAndEmptyArrays: true } },
      // 6. Format final output
      {
        $project: {
          id: '$_id',
          threadId: '$_id',
          lastText: 1,
          lastAt: 1,
          unreadCount: 1,
          studentName: {
            $cond: [
              { $ifNull: ['$student', false] },
              { $concat: ['$student.firstName', ' ', '$student.lastName'] },
              'Student'
            ]
          },
          studentId: '$studentIdStr'
        }
      },
      { $sort: { lastAt: -1 } },
      { $limit: 100 }
    ]);

    return res.json({ success: true, data: threads });

  } catch (error) {
    console.error('❌ [getAllThreads] Error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch threads.' });
  }
};

// ──────────────────────────────────────────
// PUT /api/messages/:messageId/read
// ──────────────────────────────────────────
exports.markAsRead = async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);
    if (!message) return res.status(404).json({ success: false, message: 'Message not found.' });

    // Authorization: only recipient or admin/developer can mark as read
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required.' });
    }
    const isAdmin = ['admin', 'developer'].includes(req.user.role);
    const isRecipient = String(message.toId) === String(req.user.id);
    if (!isAdmin && !isRecipient) {
      return res.status(403).json({ success: false, message: 'Not authorized to mark this message as read.' });
    }

    message.read = true;
    message.readAt = new Date();
    message.status = 'read';
    await message.save();

    return res.json({ success: true, message: 'Marked as read.' });

  } catch (error) {
    console.error('❌ [markAsRead] Error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to mark as read.' });
  }
};

// ──────────────────────────────────────────
// PUT /api/messages/thread/:threadId/read-all
// ──────────────────────────────────────────
exports.markThreadAsRead = async (req, res) => {
  try {
    await Message.updateMany(
      { threadId: req.params.threadId, toId: req.user.id, read: false },
      { $set: { read: true, readAt: new Date(), status: 'read' } }
    );
    return res.json({ success: true, message: 'Thread marked as read.' });
  } catch (error) {
    console.error('❌ [markThreadAsRead] Error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed.' });
  }
};

// ──────────────────────────────────────────
// DELETE /api/messages/:messageId
// ──────────────────────────────────────────
exports.deleteMessage = async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);
    if (!message) return res.status(404).json({ success: false, message: 'Message not found.' });

    const isSender = String(message.fromId) === String(req.user.id);
    const isAdmin = ['admin', 'developer'].includes(req.user.role);

    if (!isSender && !isAdmin) {
      return res.status(403).json({ success: false, message: 'Not authorized to delete this message.' });
    }

    await Message.findByIdAndDelete(req.params.messageId);
    return res.json({ success: true, message: 'Message deleted.' });

  } catch (error) {
    console.error('❌ [deleteMessage] Error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to delete message.' });
  }
};

// ──────────────────────────────────────────
// GET /api/messages/unread/count
// ──────────────────────────────────────────
exports.getUnreadCount = async (req, res) => {
  try {
    const count = await Message.countDocuments({ toId: req.user.id, read: false });
    return res.json({ success: true, data: { unreadCount: count } });
  } catch (error) {
    console.error('❌ [getUnreadCount] Error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch unread count.' });
  }
};
