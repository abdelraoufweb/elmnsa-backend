// ==========================================
// ANNOUNCEMENT CONTROLLER
// ==========================================

const Announcement = require('../models/Announcement');
const mongoose = require('mongoose');
const notificationService = require('../services/notificationService');

// Get all announcements
exports.getAnnouncements = async (req, res) => {
    try {
        const { target, priority } = req.query;
        let query = {};

        // If student, filter by target
        if (req.user.role === 'student') {
            const user = req.user;
            query = {
                $or: [
                    { target: 'all' },
                    { target: user.curriculum },
                    { target: `grade${user.grade}` },
                    { target: user.role === 'parent' ? 'parents' : 'students' }
                ]
            };
        }

        if (priority) query.priority = priority;

        const announcements = await Announcement.find(query)
            .sort({ createdAt: -1 })
            .populate('createdBy', 'firstName lastName fullName');

        res.status(200).json({
            success: true,
            data: announcements,
            count: announcements.length
        });
    } catch (error) {
        console.error('Get announcements error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching announcements',
            error: error.message
        });
    }
};

// Create announcement (Admin/Assistant)
exports.createAnnouncement = async (req, res) => {
    try {
        // Authorization
        if (!['admin', 'assistant', 'developer'].includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'Only staff can create announcements'
            });
        }

        const { title, message, priority, target } = req.body;

        if (!title || !message) {
            return res.status(400).json({
                success: false,
                message: 'Title and message are required'
            });
        }

        const announcement = new Announcement({
            title,
            message,
            priority: priority || 'normal',
            target: target || 'all',
            createdBy: req.user._id,
            createdByRole: req.user.role
        });

        await announcement.save();

        // ── Notify via Socket.IO & Push Notifications ──────────
        if (req.io) {
            let room = 'all';
            if (target === 'parents') room = 'role:parent';
            else if (target === 'students') room = 'role:student';
            else if (target && target.startsWith('grade')) room = `student:target:${target.replace('grade', '')}:all`;

            req.io.to(room).emit('notification:announcement', {
                title,
                priority: announcement.priority,
                timestamp: new Date().toISOString()
            });

            // Broadcast to everyone if target is all
            if (target === 'all') {
                req.io.emit('notification:announcement', {
                    title,
                    priority: announcement.priority,
                    timestamp: new Date().toISOString()
                });
            }
        }

        // Web Push Notification
        try {
            let filter = {};
            if (target && target.startsWith('grade')) {
                filter = { grade: parseInt(target.replace('grade', '')) };
            } else if (['american', 'national'].includes(target)) {
                filter = { curriculum: target };
            }

            await notificationService.notifyGroup(filter, {
                title: 'إعلان جديد 📢',
                message: title,
                type: 'announcement',
                refId: announcement._id,
                url: '/student-announcements',
                notifyParent: target === 'all' || target === 'parents'
            }, req.io);
        } catch (pushError) {
            console.error('Push notification failed for announcement:', pushError);
        }

        // ── WhatsApp Notification: Announcement to students ──────────
        try {
            const whatsappService = require('../services/whatsappService');
            const User = require('../models/User');

            // Build student filter based on target
            let studentFilter = { role: 'student', status: 'approved' };
            if (target && target.startsWith('grade')) {
                studentFilter.grade = parseInt(target.replace('grade', ''));
            } else if (['american', 'national'].includes(target)) {
                studentFilter.curriculum = target;
            }

            const targetStudents = await User.find(studentFilter).select('firstName lastName phoneNumber');

            if (targetStudents.length > 0) {
                const waMessage = `📢 *إعلان جديد*\n\n📌 ${title}\n📝 ${message}\n\n🔔 الأولوية: ${priority === 'urgent' ? '🔴 عاجل' : priority === 'high' ? '🟠 مهم' : '🟢 عادي'}`;
                const recipients = targetStudents.map(s => ({
                    phone: s.phoneNumber,
                    message: waMessage,
                    logData: {
                        type: 'announcement',
                        studentId: s._id,
                        recipientName: `${s.firstName} ${s.lastName}`,
                        recipientType: 'student'
                    }
                }));
                whatsappService.sendBatch(recipients);
                console.log(`📱 [WhatsApp] Queued ${recipients.length} announcement notifications`);
            }
        } catch (waErr) {
            console.error('WhatsApp announcement notification failed:', waErr);
        }

        res.status(201).json({
            success: true,
            message: 'Announcement created successfully',
            data: announcement
        });
    } catch (error) {
        console.error('Create announcement error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating announcement',
            error: error.message
        });
    }
};

// Delete announcement
exports.deleteAnnouncement = async (req, res) => {
    try {
        if (!['admin', 'developer'].includes(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        const { id } = req.params;
        const announcement = await Announcement.findByIdAndDelete(id);

        if (!announcement) {
            return res.status(404).json({ success: false, message: 'Announcement not found' });
        }

        res.status(200).json({
            success: true,
            message: 'Announcement deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error deleting announcement',
            error: error.message
        });
    }
};
