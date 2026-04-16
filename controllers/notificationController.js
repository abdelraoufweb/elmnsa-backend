const Notification = require('../models/Notification');
const User = require('../models/User');

/**
 * Save Web Push Subscription
 * POST /api/notifications/subscribe
 */
exports.subscribe = async (req, res) => {
  try {
    const { subscription, deviceType } = req.body;

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ success: false, message: 'Invalid subscription data' });
    }

    // Add subscription to user's list if not already there
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Check for duplicate endpoint
    const exists = user.pushSubscriptions.some(sub => sub.endpoint === subscription.endpoint);
    
    if (!exists) {
      user.pushSubscriptions.push({
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        deviceType: deviceType || 'unknown'
      });
      await user.save();
    }

    res.status(200).json({ success: true, message: 'Subscribed to push notifications' });
  } catch (error) {
    console.error('Subscribe Error:', error);
    res.status(500).json({ success: false, message: 'Failed to subscribe' });
  }
};

/**
 * Get Notification History
 * GET /api/notifications
 */
exports.getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ recipientId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50);

    res.status(200).json({ success: true, data: notifications });
  } catch (error) {
    console.error('Get Notifications Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch notifications' });
  }
};

/**
 * Mark Notification as Read
 * PATCH /api/notifications/:id/read
 */
exports.markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipientId: req.user.id },
      { read: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }

    res.status(200).json({ success: true, data: notification });
  } catch (error) {
    console.error('Mark Read Error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark as read' });
  }
};

/**
 * Mark All Notifications as Read
 * PATCH /api/notifications/read-all
 */
exports.markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany(
      { recipientId: req.user.id, read: false },
      { read: true }
    );

    res.status(200).json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark All Read Error:', error);
    res.status(500).json({ success: false, message: 'Failed to mark all as read' });
  }
};
