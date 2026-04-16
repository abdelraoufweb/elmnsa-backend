// ==========================================
// DEVICE APPROVAL ROUTES
// ==========================================

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { authMiddleware } = require('../middleware/auth');
const { generateDeviceFingerprint } = require('../middleware/deviceValidator');

// Get pending device requests (Admin/Assistant only)
router.get('/pending-devices', authMiddleware, async (req, res) => {
  try {
    // Only admin and assistant can view
    if (!['admin', 'assistant'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only Admin/Assistant can view pending devices'
      });
    }

    // Get students with pending device approvals
    let studentsWithPendingDevices = [];

    if (req.user.role === 'admin') {
      // Admin sees all students
      const students = await User.find({ role: 'student' });
      studentsWithPendingDevices = students.filter(s => 
        s.requireDeviceApproval && s.currentDeviceId
      );
    } else if (req.user.role === 'assistant') {
      // Assistant sees only assigned students
      const assistant = await User.findById(req.user._id).populate('assignedStudents');
      studentsWithPendingDevices = assistant.assignedStudents?.filter(s => 
        s.requireDeviceApproval && s.currentDeviceId
      ) || [];
    }

    const pendingData = studentsWithPendingDevices.map(student => ({
      student: {
        _id: student._id,
        firstName: student.firstName,
        lastName: student.lastName,
        phoneNumber: student.phoneNumber,
        grade: student.grade
      },
      device: {
        deviceId: student.currentDeviceId,
        createdAt: student.updatedAt,
        approvedAt: null
      }
    }));

    res.json({
      success: true,
      data: pendingData,
      count: pendingData.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching pending devices',
      error: error.message
    });
  }
});

// Get all approved student devices (Admin/Assistant only)
router.get('/all-student-devices', authMiddleware, async (req, res) => {
  try {
    // Only admin and assistant can view
    if (!['admin', 'assistant'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only Admin/Assistant can view student devices'
      });
    }

    let students = [];

    if (req.user.role === 'admin') {
      // Admin sees all students
      students = await User.find({ role: 'student' });
    } else if (req.user.role === 'assistant') {
      // Assistant sees only assigned students
      const assistant = await User.findById(req.user._id).populate('assignedStudents');
      students = assistant.assignedStudents || [];
    }

    // Collect all approved devices
    const allDevices = [];
    students.forEach(student => {
      if (student.approvedDevices && student.approvedDevices.length > 0) {
        student.approvedDevices.forEach(device => {
          allDevices.push({
            deviceId: device.deviceId,
            studentName: `${student.firstName} ${student.lastName}`,
            phoneNumber: student.phoneNumber,
            grade: student.grade,
            approvedAt: device.approvedAt,
            approvedBy: device.approvedBy,
            lastUsedAt: device.lastUsedAt,
            deviceName: device.deviceName
          });
        });
      }
    });

    res.json({
      success: true,
      data: allDevices,
      count: allDevices.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching student devices',
      error: error.message
    });
  }
});

// Approve device for student (Admin/Assistant only)
router.post('/approve-device/:studentId', authMiddleware, async (req, res) => {
  try {
    const { studentId } = req.params;
    const { deviceId, approvalNotes, status } = req.body;

    // Only admin and assistant can approve
    if (!['admin', 'assistant'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only Admin/Assistant can approve devices'
      });
    }

    const student = await User.findById(studentId);
    if (!student || student.role !== 'student') {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Verify assistant can only approve their assigned students
    if (req.user.role === 'assistant') {
      const assistant = await User.findById(req.user._id).populate('assignedStudents');
      const isAssigned = assistant.assignedStudents?.some(s => s._id.toString() === studentId);
      if (!isAssigned) {
        return res.status(403).json({
          success: false,
          message: 'You can only approve devices for your assigned students'
        });
      }
    }

    if (status === 'rejected') {
      // Reject device
      student.currentDeviceId = null;
      student.deviceApprovalNotes = `Rejected: ${approvalNotes || 'No reason provided'}`;
      await student.save();

      res.json({
        success: true,
        message: `Device rejected for ${student.firstName}`,
        student: {
          id: student._id,
          name: `${student.firstName} ${student.lastName}`
        }
      });
    } else {
      // Approve device
      const deviceToAdd = {
        deviceId: deviceId || student.currentDeviceId,
        deviceName: `Device - ${new Date().toLocaleDateString()}`,
        phoneNumber: student.phoneNumber,
        approvedAt: new Date(),
        approvedBy: `${req.user.firstName} ${req.user.lastName} (${req.user.role})`,
        lastUsedAt: new Date()
      };

      if (!student.approvedDevices) {
        student.approvedDevices = [];
      }

      student.approvedDevices.push(deviceToAdd);
      student.deviceApprovalNotes = approvalNotes || '';
      student.currentDeviceId = null; // Clear pending request
      await student.save();

      res.json({
        success: true,
        message: `Device approved for ${student.firstName}`,
        student: {
          id: student._id,
          name: `${student.firstName} ${student.lastName}`,
          approvedDevices: student.approvedDevices.length
        }
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error approving device',
      error: error.message
    });
  }
});

// Get student's approved devices (Self or Admin)
router.get('/my-devices', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    res.json({
      success: true,
      requiresApproval: user.requireDeviceApproval,
      approvedDevices: user.approvedDevices?.map(device => ({
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        approvedAt: device.approvedAt,
        approvedBy: device.approvedBy,
        lastUsedAt: device.lastUsedAt
      })) || [],
      pendingDeviceId: user.currentDeviceId
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching devices',
      error: error.message
    });
  }
});

// Remove device (Admin/Student)
router.delete('/remove-device/:deviceId', authMiddleware, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const user = await User.findById(req.user._id);

    // Check if user owns this device or is admin
    const hasDevice = user.approvedDevices?.some(d => d.deviceId === deviceId);
    if (!hasDevice && req.user.role !== 'admin' && req.user.role !== 'assistant') {
      return res.status(403).json({
        success: false,
        message: 'Device not found or permission denied'
      });
    }

    user.approvedDevices = user.approvedDevices?.filter(d => d.deviceId !== deviceId) || [];
    await user.save();

    res.json({
      success: true,
      message: 'Device removed successfully',
      remainingDevices: user.approvedDevices.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error removing device',
      error: error.message
    });
  }
});

module.exports = router;
