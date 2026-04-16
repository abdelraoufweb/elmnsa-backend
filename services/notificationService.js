const webpush = require('web-push');
const Notification = require('../models/Notification');
const User = require('../models/User');

// Configure web-push with VAPID keys from environment
webpush.setVAPIDDetails(
  `mailto:${process.env.VAPID_EMAIL || 'admin@example.com'}`,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

class NotificationService {
  /**
   * Create and send a notification to a specific user
   * @param {string} recipientId - MongoDB ID of the recipient
   * @param {object} data - { title, message, type, refId }
   * @param {object} io - Socket.io instance (optional, will use req.io if available in controllers)
   */
  async notifyUser(recipientId, data, io = null) {
    try {
      // 1. Save to Database
      const notification = new Notification({
        recipientId,
        title: data.title,
        message: data.message,
        type: data.type || 'general',
        refId: data.refId,
        read: false
      });
      await notification.save();

      // 2. Emit via Socket.io for real-time in-app alert
      if (io) {
        io.to(`notifications:${recipientId}`).emit('new_notification', {
          id: notification._id,
          ...data,
          createdAt: notification.createdAt
        });
      }

      // 3. Send Web Push Notification
      const recipient = await User.findById(recipientId).select('pushSubscriptions');
      if (recipient && recipient.pushSubscriptions && recipient.pushSubscriptions.length > 0) {
        const payload = JSON.stringify({
          title: data.title,
          body: data.message,
          icon: '/logo.png', // Adjust path if needed
          data: {
            url: data.url || '/',
            refId: data.refId
          }
        });

        // Send to all registered devices for this user
        const pushPromises = recipient.pushSubscriptions.map(sub => 
          webpush.sendNotification(sub, payload).catch(err => {
            console.error(`Push failed for sub: ${sub.endpoint}`, err.statusCode);
            if (err.statusCode === 410 || err.statusCode === 404) {
              // Subscription expired or invalid - should be removed
              return 'REMOVE_SUB';
            }
            return null;
          })
        );

        const results = await Promise.all(pushPromises);
        
        // Clean up invalid subscriptions
        if (results.includes('REMOVE_SUB')) {
          recipient.pushSubscriptions = recipient.pushSubscriptions.filter((_, i) => results[i] !== 'REMOVE_SUB');
          await recipient.save();
        }
      }

      return notification;
    } catch (error) {
      console.error('NotificationService Error:', error);
      return null;
    }
  }

  /**
   * Notify a student and their linked parent
   * @param {string} studentId - Student ID
   * @param {object} studentData - Data for student notification
   * @param {object} parentData - Data for parent notification
   * @param {object} io - Socket.io instance
   */
  async notifyStudentAndParent(studentId, studentData, parentData, io = null) {
    // 1. Notify student
    await this.notifyUser(studentId, studentData, io);

    // 2. Notify parent
    const student = await User.findById(studentId).select('parentPhone');
    if (student && student.parentPhone) {
      const parent = await User.findOne({ 
        phoneNumber: student.parentPhone,
        role: 'parent' 
      });
      if (parent) {
        await this.notifyUser(parent._id, parentData, io);
      }
    }
  }

  /**
   * Notify a group of students (e.g., by grade and curriculum)
   * @param {object} filter - { grade, curriculum }
   * @param {object} data - { title, message, type, refId }
   * @param {object} io - Socket.io instance
   */
  async notifyGroup(filter, data, io = null) {
    try {
      const students = await User.find({ 
        role: 'student',
        status: 'approved',
        ...filter 
      }).select('_id parentPhone');

      const promises = students.map(async (student) => {
        // Notify student
        await this.notifyUser(student._id, data, io);

        // Notify parent if it's a general announcement or relevant content
        if (data.notifyParent && student.parentPhone) {
          const parent = await User.findOne({ 
            phoneNumber: student.parentPhone,
            role: 'parent' 
          });
          if (parent) {
            await this.notifyUser(parent._id, {
              ...data,
              message: `تنبيه لولي الأمر: ${data.message}` // Prefix for parents
            }, io);
          }
        }
      });

      await Promise.all(promises);
    } catch (error) {
      console.error('notifyGroup Error:', error);
    }
  }
}

module.exports = new NotificationService();
