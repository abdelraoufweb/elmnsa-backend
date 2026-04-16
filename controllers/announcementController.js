// ==========================================
// ANNOUNCEMENT CONTROLLER
// ==========================================

const Announcement = require('../models/Announcement');
const mongoose = require('mongoose');

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

        // ── Notify via Socket.IO ──────────
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
