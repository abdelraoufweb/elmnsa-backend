// ==========================================
// SCHEDULE CONTROLLER
// ==========================================

const Schedule = require('../models/Schedule');
const User = require('../models/User');
const mongoose = require('mongoose');
const notificationService = require('../services/notificationService');

// Get all schedules
exports.getSchedules = async (req, res) => {
    try {
        const { curriculum, grade, status } = req.query;
        let query = {};

        console.log(`🔍 [SCHEDULES] Fetching for user: ${req.user.role} (${req.user._id}), Curriculum: ${req.user.curriculum}, Grade: ${req.user.grade}`);

        // If student, filter by target
        if (req.user.role === 'student') {
            const user = req.user;
            console.log(`👤 Student ${user._id} Profile - Curric: ${user.curriculum}, Grade: ${user.grade}`);

            query.status = 'sent';
            if (user.curriculum) query.curriculum = user.curriculum;
            if (user.grade) query.grade = user.grade;

            console.log('📝 Query generated for student:', JSON.stringify(query));
        } else if (req.user.role === 'parent') {
            // Parents see for their children
            const parent = await User.findById(req.user.id);

            // If studentId provided, filter by that student
            if (req.query.studentId) {
                const student = await User.findById(req.query.studentId);
                if (parent && student) {
                    if (student.parentPhone !== parent.phoneNumber && !parent.childrenIds.includes(student._id)) {
                        return res.status(403).json({ success: false, message: 'Unauthorized access to student' });
                    }
                }
                if (student) {
                    query.curriculum = student.curriculum;
                    query.grade = student.grade;
                }
                query.status = 'sent';
            } else {
                if (!parent) return res.status(400).json({ success: false, message: 'Please select a student first' });
                // Find all children
                const children = await User.find({
                    $or: [
                        { parentPhone: parent.phoneNumber },
                        { _id: { $in: parent.childrenIds || [] } }
                    ],
                    role: 'student'
                });
                query.$or = children.map(c => ({ curriculum: c.curriculum, grade: c.grade }));
                query.status = 'sent';
            }
        }

        if (curriculum) query.curriculum = curriculum;
        if (grade) query.grade = parseInt(grade);
        if (status) query.status = status;

        const schedules = await Schedule.find(query)
            .sort({ dateTime: 1 })
            .populate('createdBy', 'firstName lastName fullName');

        res.status(200).json({
            success: true,
            data: schedules,
            count: schedules.length
        });
    } catch (error) {
        console.error('Get schedules error:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching schedules',
            error: error.message
        });
    }
};

// Create schedule (Admin/Assistant)
exports.createSchedule = async (req, res) => {
    try {
        // Authorization
        if (!['admin', 'assistant', 'developer'].includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'Only staff can create schedules'
            });
        }

        const { title, description, dateTime, location, notes, curriculum, grade, status } = req.body;

        if (!title || !dateTime || !location || !curriculum || !grade) {
            return res.status(400).json({
                success: false,
                message: 'Title, date, location, curriculum, and grade are required'
            });
        }

        const schedule = new Schedule({
            title,
            description,
            dateTime: new Date(dateTime),
            location,
            notes,
            curriculum,
            grade: parseInt(grade),
            status: status || 'sent',
            createdBy: req.user._id,
            createdByRole: req.user.role
        });

        await schedule.save();

        // ── Notify relevant students & parents via NotificationService ──────────
        if (schedule.status === 'sent') {
            notificationService.notifyGroup(
                { grade: schedule.grade, curriculum: schedule.curriculum },
                {
                    title: 'موعد حصة جديد! 🗓️',
                    message: `تم تحديد موعد حصة جديد: ${title} بتاريخ ${new Date(dateTime).toLocaleDateString('ar-EG')}`,
                    type: 'schedule',
                    refId: schedule._id,
                    url: '/student-schedules',
                    notifyParent: true // User requested parents get these too
                },
                req.io
            );
        }

        res.status(201).json({
            success: true,
            message: 'Schedule created successfully',
            data: schedule
        });
    } catch (error) {
        console.error('Create schedule error:', error);
        res.status(500).json({
            success: false,
            message: 'Error creating schedule',
            error: error.message
        });
    }
};

// Update schedule status/data
exports.updateSchedule = async (req, res) => {
    try {
        if (!['admin', 'assistant', 'developer'].includes(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        const { id } = req.params;

        // Validate ID
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid schedule ID' });
        }

        const updateData = req.body;
        const schedule = await Schedule.findByIdAndUpdate(id, updateData, { new: true });

        if (!schedule) {
            return res.status(404).json({ success: false, message: 'Schedule not found' });
        }

        // ── Notify relevant students & parents if status changed to sent ──────────
        if (updateData.status === 'sent') {
            notificationService.notifyGroup(
                { grade: schedule.grade, curriculum: schedule.curriculum },
                {
                    title: 'موعد حصة جديد! 🗓️',
                    message: `تم تحديث موعد الحصة: ${schedule.title}`,
                    type: 'schedule',
                    refId: schedule._id,
                    url: '/student-schedules',
                    notifyParent: true
                },
                req.io
            );
        }

        res.status(200).json({
            success: true,
            message: 'Schedule updated successfully',
            data: schedule
        });
    } catch (error) {
        console.error('Update schedule error:', error);
        res.status(500).json({
            success: false,
            message: 'Error updating schedule',
            error: error.message
        });
    }
};

// Delete schedule
exports.deleteSchedule = async (req, res) => {
    try {
        if (!['admin', 'developer'].includes(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        const { id } = req.params;

        // Validate ID
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid schedule ID' });
        }

        const schedule = await Schedule.findByIdAndDelete(id);

        if (!schedule) {
            return res.status(404).json({ success: false, message: 'Schedule not found' });
        }

        res.status(200).json({
            success: true,
            message: 'Schedule deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error deleting schedule',
            error: error.message
        });
    }
};
