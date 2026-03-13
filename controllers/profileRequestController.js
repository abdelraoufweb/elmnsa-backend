const mongoose = require('mongoose');
const ProfileRequest = require('../models/ProfileRequest');
const User = require('../models/User');
const SecurityLog = require('../models/SecurityLog');

/**
 * Submit a profile update request (Student only)
 * POST /api/profile-requests
 */
exports.createRequest = async (req, res) => {
    try {
        const changes = req.body;

        // Prevent sensitive field changes via this endpoint (e.g. role, status)
        delete changes.role;
        delete changes.status;
        delete changes.password;
        delete changes._id;
        delete changes.approvedDevices;

        const request = new ProfileRequest({
            studentId: req.user.id,
            studentName: `${req.user.firstName} ${req.user.lastName}`,
            requestedChanges: changes,
            status: 'pending'
        });

        await request.save();

        res.status(201).json({
            success: true,
            message: 'Profile update request submitted successfully',
            data: request
        });
    } catch (error) {
        console.error('Create profile request error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit request',
            error: error.message
        });
    }
};

/**
 * List pending requests (Admin/Assistant)
 * GET /api/profile-requests
 */
exports.listRequests = async (req, res) => {
    try {
        // Authorization
        if (!['admin', 'assistant', 'developer'].includes(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        const requests = await ProfileRequest.find({ status: 'pending' })
            .populate('studentId', 'firstName lastName phoneNumber grade curriculum')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            data: requests,
            count: requests.length
        });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Error fetching requests', error: error.message });
    }
};

/**
 * Resolve request (Approve/Reject)
 * POST /api/profile-requests/:requestId/resolve
 */
exports.resolveRequest = async (req, res) => {
    try {
        // Authorization
        if (!['admin', 'assistant', 'developer'].includes(req.user.role)) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        const { status, adminNote } = req.body;
        const { requestId } = req.params;

        if (!['approved', 'rejected'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        const request = await ProfileRequest.findById(requestId);
        if (!request) return res.status(404).json({ success: false, message: 'Request not found' });

        if (request.status !== 'pending') {
            return res.status(400).json({ success: false, message: 'Request already resolved' });
        }

        // If approved, update the user profile
        if (status === 'approved') {
            const user = await User.findById(request.studentId);
            if (user) {
                Object.assign(user, request.requestedChanges);
                await user.save();
            }
        }

        request.status = status;
        request.adminNote = adminNote;
        request.reviewedBy = req.user.id;
        request.reviewedByRole = req.user.role;
        request.reviewedAt = new Date();

        await request.save();

        // Log action
        await SecurityLog.create({
            type: `profile_request_${status}`,
            userId: req.user.id,
            description: `${status.toUpperCase()} profile request for student ${request.studentName}`,
            severity: 'info'
        });

        res.status(200).json({
            success: true,
            message: `Request ${status}`,
            data: request
        });
    } catch (error) {
        console.error('Resolve request error:', error);
        res.status(500).json({ success: false, message: 'Error resolving request', error: error.message });
    }
};
