// ==========================================
// MESSAGE CONTROLLER
// ==========================================

const Message = require('../models/Message');
const User = require('../models/User');

/**
 * Send message
 * POST /api/messages/send
 */
exports.sendMessage = async (req, res) => {
  try {
    const { toId, text, threadId } = req.body;

    // Validation
    if (!toId || !text) {
      return res.status(400).json({
        success: false,
        message: 'toId and text are required'
      });
    }

    // Only admin, assistant, developer can send messages
    const allowedRoles = ['admin', 'assistant', 'developer'];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin, assistant, or developer can send messages'
      });
    }

    // Check recipient exists
    const recipient = await User.findById(toId);
    if (!recipient) {
      return res.status(404).json({
        success: false,
        message: 'Recipient not found'
      });
    }

    // Create message
    const message = new Message({
      text,
      type: 'text',
      from: req.user.role,
      fromId: req.user.id,
      fromName: `${req.user.firstName} ${req.user.lastName}`,
      toId,
      toRole: recipient.role,
      threadId: threadId || `chat:${toId}`,
      status: 'delivered',
      read: false
    });

    await message.save();

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: {
        id: message._id,
        text: message.text,
        from: message.from,
        fromName: message.fromName,
        status: message.status,
        createdAt: message.createdAt
      }
    });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: error.message
    });
  }
};

/**
 * Get messages (with pagination)
 * GET /api/messages?threadId=chat:studentId&page=1&limit=20
 */
exports.getMessages = async (req, res) => {
  try {
    const { threadId, page = 1, limit = 20 } = req.query;

    // Build query - ALL users see only their own messages
    const query = {
      $or: [
        { toId: req.user.id },
        { fromId: req.user.id }
      ]
    };
    
    if (threadId) query.threadId = threadId;

    // Pagination
    const skip = (page - 1) * limit;

    // Fetch messages
    const messages = await Message.find(query)
      .populate('fromId', 'firstName lastName role')
      .populate('toId', 'firstName lastName role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Count total
    const total = await Message.countDocuments(query);

    res.status(200).json({
      success: true,
      data: messages.reverse(),  // Return in chronological order
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch messages',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get single thread messages
 * GET /api/messages/:threadId
 */
exports.getThreadMessages = async (req, res) => {
  try {
    const { threadId } = req.params;

    // Parse thread ID to extract participants
    // Thread format: "chat:recipientId" or custom format
    
    // Check if user is participant in this thread
    let isParticipant = false;
    if (threadId.includes(req.user.id)) {
      isParticipant = true;
    }
    
    // Admin/developer can see all threads
    if (['admin', 'developer', 'assistant'].includes(req.user.role)) {
      isParticipant = true;
    }

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this thread'
      });
    }

    const messages = await Message.find({ threadId })
      .populate('fromId', 'firstName lastName role')
      .populate('toId', 'firstName lastName role')
      .sort({ createdAt: 1 });

    res.status(200).json({
      success: true,
      data: messages,
      count: messages.length
    });
  } catch (error) {
    console.error('Get thread messages error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch thread messages',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Mark message as read
 * PUT /api/messages/:messageId/read
 */
exports.markAsRead = async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    // Mark as read
    message.read = true;
    message.readAt = new Date();
    message.status = 'read';
    await message.save();

    res.status(200).json({
      success: true,
      message: 'Message marked as read'
    });
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark message as read',
      error: error.message
    });
  }
};

/**
 * Delete message
 * DELETE /api/messages/:messageId
 */
exports.deleteMessage = async (req, res) => {
  try {
    const message = await Message.findById(req.params.messageId);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found'
      });
    }

    // Only sender or admin can delete
    if (message.fromId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to delete this message'
      });
    }

    await Message.findByIdAndDelete(req.params.messageId);

    res.status(200).json({
      success: true,
      message: 'Message deleted successfully'
    });
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete message',
      error: error.message
    });
  }
};

/**
 * Get unread messages count
 * GET /api/messages/unread/count
 */
exports.getUnreadCount = async (req, res) => {
  try {
    const count = await Message.countDocuments({
      toId: req.user.id,
      read: false
    });

    res.status(200).json({
      success: true,
      data: { unreadCount: count }
    });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch unread count',
      error: error.message
    });
  }
};
