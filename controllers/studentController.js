// ==========================================
// STUDENT CONTROLLER
// ==========================================

const User = require('../models/User');
const Theme = require('../models/Theme');

/**
 * List all students (Admin/Assistant/Developer only)
 * GET /api/students?grade=10&curriculum=american&status=approved&page=1&limit=20
 */
exports.listStudents = async (req, res) => {
  try {
    // Authorization
    const allowedRoles = ['admin', 'assistant', 'developer'];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin, assistant, or developer can list students'
      });
    }

    const { grade, curriculum, status, page = 1, limit = 20 } = req.query;

    // Build query
    const query = { role: 'student' };
    if (grade) query.grade = parseInt(grade);
    if (curriculum) query.curriculum = curriculum;
    if (status) query.status = status;

    // Pagination
    const skip = (page - 1) * limit;

    // Fetch students
    const students = await User.find(query)
      .select('-password')
      .sort({ registeredAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Count total
    const total = await User.countDocuments(query);

    res.status(200).json({
      success: true,
      data: students,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('List students error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch students',
      error: error.message
    });
  }
};

/**
 * Get student details
 * GET /api/students/:studentId
 */
exports.getStudent = async (req, res) => {
  try {
    const { studentId } = req.params;

    // Authorization: Own profile, admin, assistant, or developer
    const isOwn = req.user.id === studentId;
    const isAllowedRole = ['admin', 'assistant', 'developer'].includes(req.user.role);
    
    if (!isOwn && !isAllowedRole) {
      return res.status(403).json({
        success: false,
        message: 'You do not have access to this student\'s information'
      });
    }

    const student = await User.findById(studentId)
      .select('-password');

    if (!student || student.role !== 'student') {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    res.status(200).json({
      success: true,
      data: student
    });
  } catch (error) {
    console.error('Get student error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch student',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Edit student data (Admin/Assistant/Developer only)
 * PUT /api/students/:studentId
 */
exports.updateStudent = async (req, res) => {
  try {
    // Authorization
    const allowedRoles = ['admin', 'assistant', 'developer'];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin, assistant, or developer can edit students'
      });
    }

    const student = await User.findById(req.params.studentId);

    if (!student || student.role !== 'student') {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Update allowed fields
    const { firstName, lastName, middleName, phoneNumber, parentPhone, grade, curriculum, schoolName } = req.body;

    if (firstName) student.firstName = firstName;
    if (lastName) student.lastName = lastName;
    if (middleName) student.middleName = middleName;
    if (phoneNumber) student.phoneNumber = phoneNumber;
    if (parentPhone) student.parentPhone = parentPhone;
    if (grade) student.grade = parseInt(grade);
    if (curriculum) student.curriculum = curriculum;
    if (schoolName) student.schoolName = schoolName;

    student.updatedAt = new Date();
    await student.save();

    res.status(200).json({
      success: true,
      message: 'Student updated successfully',
      data: {
        id: student._id,
        firstName: student.firstName,
        lastName: student.lastName,
        grade: student.grade,
        updatedAt: student.updatedAt
      }
    });
  } catch (error) {
    console.error('Update student error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update student',
      error: error.message
    });
  }
};

/**
 * Delete student (Admin/Developer only)
 * DELETE /api/students/:studentId
 */
exports.deleteStudent = async (req, res) => {
  try {
    // Authorization
    const allowedRoles = ['admin', 'developer'];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin or developer can delete students'
      });
    }

    const student = await User.findById(req.params.studentId);

    if (!student || student.role !== 'student') {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Delete student and related data
    await User.findByIdAndDelete(req.params.studentId);
    await Theme.deleteOne({ userId: req.params.studentId });

    res.status(200).json({
      success: true,
      message: 'Student deleted successfully'
    });
  } catch (error) {
    console.error('Delete student error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete student',
      error: error.message
    });
  }
};

/**
 * Apply theme to student
 * POST /api/students/:studentId/apply-theme
 */
exports.applyTheme = async (req, res) => {
  try {
    // Authorization
    const allowedRoles = ['admin', 'assistant', 'developer'];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin, assistant, or developer can apply themes'
      });
    }

    const { themeName } = req.body;

    if (!themeName) {
      return res.status(400).json({
        success: false,
        message: 'Theme name required'
      });
    }

    const validThemes = ['default', 'theme-dark', 'theme-light', 'theme-ocean', 'theme-sunset', 'theme-purple', 'theme-forest'];
    if (!validThemes.includes(themeName)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid theme name'
      });
    }

    const student = await User.findById(req.params.studentId);
    if (!student || student.role !== 'student') {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Create or update theme
    let theme = await Theme.findOne({ userId: req.params.studentId });
    if (!theme) {
      theme = new Theme({
        userId: req.params.studentId,
        themeName,
        appliedBy: req.user.id,
        appliedByRole: req.user.role
      });
    } else {
      theme.themeName = themeName;
      theme.appliedBy = req.user.id;
      theme.appliedByRole = req.user.role;
      theme.updatedAt = new Date();
    }

    await theme.save();

    res.status(200).json({
      success: true,
      message: 'Theme applied successfully',
      data: {
        themeName: theme.themeName,
        appliedAt: theme.appliedAt
      }
    });
  } catch (error) {
    console.error('Apply theme error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to apply theme',
      error: error.message
    });
  }
};

/**
 * Get student's theme
 * GET /api/students/:studentId/theme
 */
exports.getStudentTheme = async (req, res) => {
  try {
    const theme = await Theme.findOne({ userId: req.params.studentId })
      .populate('appliedBy', 'firstName lastName role');

    if (!theme) {
      return res.status(404).json({
        success: false,
        message: 'No theme set for this student'
      });
    }

    res.status(200).json({
      success: true,
      data: theme
    });
  } catch (error) {
    console.error('Get student theme error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch theme',
      error: error.message
    });
  }
};

/**
 * Approve pending student account
 * POST /api/students/:studentId/approve
 */
exports.approveStudent = async (req, res) => {
  try {
    // Authorization
    const allowedRoles = ['admin', 'developer'];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin or developer can approve students'
      });
    }

    const student = await User.findById(req.params.studentId);
    if (!student || student.role !== 'student') {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    student.status = 'approved';
    student.approvedAt = new Date();
    student.approvedBy = req.user.id;
    await student.save();

    res.status(200).json({
      success: true,
      message: 'Student approved successfully'
    });
  } catch (error) {
    console.error('Approve student error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve student',
      error: error.message
    });
  }
};

/**
 * Block student account
 * POST /api/students/:studentId/block
 */
exports.blockStudent = async (req, res) => {
  try {
    // Authorization
    const allowedRoles = ['admin', 'developer'];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin or developer can block students'
      });
    }

    const { reason } = req.body;

    const student = await User.findById(req.params.studentId);
    if (!student || student.role !== 'student') {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    student.status = 'blocked';
    student.blockedReason = reason || 'No reason provided';
    await student.save();

    res.status(200).json({
      success: true,
      message: 'Student blocked successfully'
    });
  } catch (error) {
    console.error('Block student error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to block student',
      error: error.message
    });
  }
};

/**
 * Get worksheets
 * GET /api/students/worksheets
 */
exports.getWorksheets = async (req, res) => {
  try {
    const { curriculum, grade } = req.query;

    let query = { isPublic: true };
    if (curriculum) query.curriculum = curriculum;
    if (grade) query.grade = parseInt(grade);

    if (req.user.role === 'student' && req.user.curriculum && req.user.grade) {
      query.curriculum = req.user.curriculum;
      query.grade = req.user.grade;
    }

    const worksheets = await Worksheet.find(query)
      .populate('createdBy', 'fullName')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: worksheets,
      count: worksheets.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching worksheets',
      error: error.message
    });
  }
};

/**
 * Upload homework
 */
exports.uploadHomework = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded',
        error: 'NO_FILE'
      });
    }

    const { notes } = req.body;

    const homework = new Homework({
      studentId: req.user._id,
      studentName: req.user.fullName,
      studentGrade: req.user.grade,
      curriculum: req.user.curriculum,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      fileType: req.file.mimetype,
      fileUrl: getFileUrl('homework', req.file.filename),
      notes,
      status: 'pending'
    });

    await homework.save();

    res.status(201).json({
      success: true,
      message: 'Homework uploaded successfully',
      data: homework
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error uploading homework',
      error: error.message
    });
  }
};

/**
 * Get student's homework submissions
 */
exports.getHomework = async (req, res) => {
  try {
    const homework = await Homework.find({ studentId: req.user._id }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: homework,
      count: homework.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching homework',
      error: error.message
    });
  }
};

/**
 * Get student profile
 */
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching profile',
      error: error.message
    });
  }
};

/**
 * Update student profile
 */
exports.updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, middleName, phoneNumber, schoolName } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        firstName,
        lastName,
        middleName,
        phoneNumber,
        schoolName
      },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating profile',
      error: error.message
    });
  }
};

/**
 * Send message
 */
exports.sendMessage = async (req, res) => {
  try {
    const { recipientId, content, type } = req.body;

    if (!recipientId || !content) {
      return res.status(400).json({
        success: false,
        message: 'Recipient and content are required'
      });
    }

    const message = new Message({
      senderId: req.user._id,
      senderName: req.user.fullName,
      recipientId,
      content,
      type: type || 'text'
    });

    await message.save();

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: message
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error sending message',
      error: error.message
    });
  }
};

/**
 * Get messages
 */
exports.getMessages = async (req, res) => {
  try {
    const messages = await Message.find({
      $or: [
        { senderId: req.user._id },
        { recipientId: req.user._id }
      ]
    }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: messages,
      count: messages.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching messages',
      error: error.message
    });
  }
};
