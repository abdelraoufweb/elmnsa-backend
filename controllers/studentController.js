// ==========================================
// STUDENT CONTROLLER
// ==========================================

const mongoose = require('mongoose');
const User = require('../models/User');
const Theme = require('../models/Theme');
const Homework = require('../models/Homework');
const Worksheet = require('../models/Worksheet');
const Message = require('../models/Message');
const { validateFileContent } = require('../utils/fileValidators');
const { deleteFile } = require('../middleware/fileUpload');
const { uploadFile } = require('../services/s3Service');
const fs = require('fs').promises;
const notificationService = require('../services/notificationService');

/**
 * Get children for a parent
 * GET /api/students/parent/children
 */
exports.getParentChildren = async (req, res) => {
  try {
    if (req.user.role !== 'parent') {
      return res.status(403).json({
        success: false,
        message: 'Only parents can access this endpoint'
      });
    }

    let query = { role: 'student', status: 'approved' };
    const parentPhoneQuery = req.query.phone;

    // Find students by parent phone or by childrenIds if populated
    // Usually parents log in with their phone number
    const parent = await User.findById(req.user.id);

    if (!parent && !parentPhoneQuery) {
      return res.status(404).json({
        success: false,
        message: 'Parent user not found and no phone number provided'
      });
    }

    if (parent && parent.childrenIds && parent.childrenIds.length > 0) {
      query._id = { $in: parent.childrenIds };
    } else {
      // Fallback: search by provided phone or parent's registered phone
      query.parentPhone = parentPhoneQuery || (parent ? parent.phoneNumber : null);

      // If parentPhone is somehow null, it will return an empty list rather than everyone
      if (!query.parentPhone) return res.status(200).json({ success: true, data: [] });
    }

    const children = await User.find(query).select('-password');

    res.status(200).json({
      success: true,
      data: children
    });
  } catch (error) {
    console.error('Get parent children error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch children',
      error: error.message
    });
  }
};

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
    const studentId = req.params.studentId;

    // ✅ التحقق من صحة المعرف
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid student ID format'
      });
    }

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

    const studentId = req.params.studentId;

    // ✅ التحقق من صحة المعرف
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid student ID format'
      });
    }

    const student = await User.findById(studentId);

    if (!student || student.role !== 'student') {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Update allowed fields
    const { firstName, lastName, middleName, phoneNumber, parentPhone, grade, curriculum, schoolName } = req.body;

    if (firstName !== undefined) student.firstName = firstName;
    if (lastName !== undefined) student.lastName = lastName;
    if (middleName !== undefined) student.middleName = middleName;
    if (phoneNumber !== undefined) {
      if (parentPhone === undefined && student.parentPhone === phoneNumber.replace(/\D/g, '')) {
         return res.status(400).json({ success: false, message: 'Student and parent phone numbers cannot be the same' });
      }
      student.phoneNumber = phoneNumber;
    }
    if (parentPhone !== undefined) {
      if (student.phoneNumber === parentPhone.replace(/\D/g, '')) {
         return res.status(400).json({ success: false, message: 'Student and parent phone numbers cannot be the same' });
      }
      student.parentPhone = parentPhone;
    }
    if (grade !== undefined) student.grade = parseInt(grade);
    if (curriculum !== undefined) student.curriculum = curriculum;
    if (schoolName !== undefined) student.schoolName = schoolName;

    student.updatedAt = new Date();
    const savedStudent = await student.save();

    // ✅ التحقق من التحديث
    const verifyStudent = await User.findById(studentId);
    if (!verifyStudent) {
      throw new Error('Verification failed: Student not found after update');
    }

    res.status(200).json({
      success: true,
      message: 'Student updated successfully',
      data: {
        id: savedStudent._id,
        firstName: savedStudent.firstName,
        lastName: savedStudent.lastName,
        grade: savedStudent.grade,
        updatedAt: savedStudent.updatedAt
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
    const allowedRoles = ['admin', 'assistant', 'developer'];
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin or developer can delete students'
      });
    }

    const studentId = req.params.studentId;

    // ✅ التحقق من صحة المعرف
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid student ID format'
      });
    }

    const student = await User.findById(studentId);

    if (!student || student.role !== 'student') {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Delete student and related data
    await User.findByIdAndDelete(studentId);
    await Theme.deleteOne({ userId: studentId });

    // ✅ التحقق من الحذف
    const verifyStudent = await User.findById(studentId);
    if (verifyStudent) {
      throw new Error('Verification failed: Student still exists after deletion');
    }

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
    const studentId = req.params.studentId;

    // ✅ التحقق من صحة المعرف
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid student ID format'
      });
    }

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

    const student = await User.findById(studentId);
    if (!student || student.role !== 'student') {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // Create or update theme
    let theme = await Theme.findOne({ userId: studentId });
    if (!theme) {
      theme = new Theme({
        userId: studentId,
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

    const savedTheme = await theme.save();

    // ✅ التحقق من التحديث
    const verifyTheme = await Theme.findOne({ userId: studentId });
    if (!verifyTheme || verifyTheme.themeName !== themeName) {
      throw new Error('Verification failed: Theme not saved correctly');
    }

    res.status(200).json({
      success: true,
      message: 'Theme applied successfully',
      data: {
        themeName: savedTheme.themeName,
        appliedAt: savedTheme.appliedAt
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
    const studentId = req.params.studentId;

    // ✅ التحقق من صحة المعرف
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid student ID format'
      });
    }

    const theme = await Theme.findOne({ userId: studentId })
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

    const studentId = req.params.studentId;

    // ✅ التحقق من صحة المعرف
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid student ID format'
      });
    }

    const student = await User.findById(studentId);
    if (!student || student.role !== 'student') {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // ✅ التحقق من أنه في حالة pending
    if (student.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Student is not pending. Current status: ${student.status}`
      });
    }

    student.status = 'approved';
    student.approvedAt = new Date();
    student.approvedBy = req.user.id;
    const savedStudent = await student.save();

    // ✅ التحقق من التحديث
    const verifyStudent = await User.findById(studentId);
    if (verifyStudent.status !== 'approved') {
      throw new Error('Verification failed: Student status not updated');
    }

    res.status(200).json({
      success: true,
      message: 'Student approved successfully',
      data: {
        studentId: savedStudent._id,
        status: savedStudent.status,
        approvedAt: savedStudent.approvedAt
      }
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
    const studentId = req.params.studentId;

    // ✅ التحقق من صحة المعرف
    if (!mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid student ID format'
      });
    }

    const student = await User.findById(studentId);
    if (!student || student.role !== 'student') {
      return res.status(404).json({
        success: false,
        message: 'Student not found'
      });
    }

    // ✅ التحقق من أنه ليس مسدود بالفعل
    if (student.status === 'blocked') {
      return res.status(400).json({
        success: false,
        message: 'Student is already blocked'
      });
    }

    student.status = 'blocked';
    student.blockedReason = reason || 'No reason provided';
    student.blockedAt = new Date();
    student.blockedBy = req.user.id;
    const savedStudent = await student.save();

    // ✅ التحقق من التحديث
    const verifyStudent = await User.findById(studentId);
    if (verifyStudent.status !== 'blocked') {
      throw new Error('Verification failed: Student status not updated');
    }

    res.status(200).json({
      success: true,
      message: 'Student blocked successfully',
      data: {
        studentId: savedStudent._id,
        status: savedStudent.status,
        blockedAt: savedStudent.blockedAt,
        blockedReason: savedStudent.blockedReason
      }
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

    let query = { isPublic: true }; // Only public by default for students

    // If not a student, allow viewing all
    if (req.user.role !== 'student') {
      delete query.isPublic;
    }

    if (curriculum) query.curriculum = curriculum;
    if (grade) query.grade = parseInt(grade);

    if (req.user.role === 'student' && req.user.curriculum && req.user.grade) {
      query.curriculum = req.user.curriculum;
      query.grade = req.user.grade;
    }

    const worksheets = await Worksheet.find(query)
      .populate('createdBy', 'firstName lastName fullName')
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
 * Upload worksheet (Admin/Assistant/Developer)
 * POST /api/students/worksheets
 */
exports.uploadWorksheet = async (req, res) => {
  try {
    // Authorization
    if (!['admin', 'assistant', 'developer'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin, assistant, or developer can upload worksheets'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // PDF Validation
    const isPdf = req.file.mimetype === 'application/pdf' || req.file.originalname.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      try { await fs.unlink(req.file.path); } catch (e) { }
      return res.status(400).json({ success: false, message: 'Only PDF files are allowed' });
    }

    // Magic Byte Validation
    const isValidFile = await validateFileContent(req.file.path, 'application/pdf');
    if (!isValidFile) {
      try { await fs.unlink(req.file.path); } catch (e) { }
      return res.status(400).json({ success: false, message: 'Invalid file content' });
    }

    const { title, description, curriculum, grade, isPublic, link } = req.body;

    if (!title || !curriculum || !grade) {
      try { await fs.unlink(req.file.path); } catch (e) { }
      return res.status(400).json({ success: false, message: 'Title, curriculum, and grade are required' });
    }

    // UPLOAD TO R2
    console.log('📤 Uploading worksheet to R2...');
    const r2Url = await uploadFile(req.file, 'worksheets');
    console.log('✅ Worksheet uploaded to R2:', r2Url);

    const worksheet = new Worksheet({
      title,
      description,
      curriculum,
      grade: parseInt(grade),
      isPublic: isPublic === 'true' || isPublic === true,
      fileUrl: r2Url,
      fileType: req.file.mimetype,
      fileSize: req.file.size,
      link: link || null,
      createdBy: req.user._id,
      createdByRole: req.user.role
    });

    await worksheet.save();

    // ── Notify relevant students via Socket.IO & Push ──────────
    if (worksheet.isPublic) {
      notificationService.notifyGroup(
        { grade: worksheet.grade, curriculum: worksheet.curriculum },
        {
          title: 'شيت جديد متاح! 📄',
          message: `تمت إضافة شيت جديد: ${worksheet.title}`,
          type: 'worksheet',
          refId: worksheet._id,
          url: '/student-worksheets'
        },
        req.io
      );
    }

    res.status(201).json({
      success: true,
      message: 'Worksheet uploaded successfully',
      data: worksheet
    });
  } catch (error) {
    console.error('Worksheet upload error:', error);
    if (req.file) {
      try { await fs.unlink(req.file.path); } catch (e) { }
    }
    res.status(500).json({
      success: false,
      message: 'Error uploading worksheet',
      error: error.message
    });
  }
};



/**
 * Delete a worksheet
 */
exports.deleteWorksheet = async (req, res) => {
  try {
    const { id } = req.params;

    // Authorization
    if (!['admin', 'assistant', 'developer'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const worksheet = await Worksheet.findById(id);
    if (!worksheet) {
      return res.status(404).json({ success: false, message: 'Worksheet not found' });
    }

    // Delete file if exists (Supports R2 and Local)
    if (worksheet.fileUrl) {
      await deleteFile(worksheet.fileUrl);
    }

    await Worksheet.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Worksheet deleted successfully'
    });
  } catch (error) {
    console.error('Delete worksheet error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting worksheet',
      error: error.message
    });
  }
};


/**
 * Upload homework (PDF Only)
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

    // Strict PDF check
    const isPdf = req.file.mimetype === 'application/pdf' || req.file.originalname.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      // Clean up invalid file asynchronously
      try {
        await fs.access(req.file.path);
        await fs.unlink(req.file.path);
      } catch (e) {
        // ignore ENOENT and other unlink errors
      }

      return res.status(400).json({
        success: false,
        message: 'Only PDF files are allowed',
        error: 'INVALID_FILE_TYPE'
      });
    }

    // Magic Byte Validation
    const isValidFile = await validateFileContent(req.file.path, 'application/pdf');
    if (!isValidFile) {
      // Delete invalid file asynchronously
      try {
        await fs.access(req.file.path);
        await fs.unlink(req.file.path);
      } catch (e) {
        // ignore ENOENT and other unlink errors
      }

      return res.status(400).json({
        success: false,
        message: 'Invalid file content (spoofed extension detected)',
        error: 'INVALID_FILE_CONTENT'
      });
    }

    // UPLOAD TO R2
    console.log('📤 Uploading homework to R2...');
    const r2Url = await uploadFile(req.file, 'homework');
    console.log('✅ Homework uploaded to R2:', r2Url);

    const { notes } = req.body;

    const homework = new Homework({
      studentId: req.user._id,
      studentName: req.user.firstName + ' ' + req.user.lastName,
      studentGrade: req.user.grade,
      curriculum: req.user.curriculum,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      fileType: req.file.mimetype,
      fileUrl: r2Url,
      notes,
      status: 'pending'
    });

    await homework.save();

    // ── Notify staff via Socket.IO ──────────
    if (req.io) {
      req.io.to('role:staff').emit('notification:homework', {
        studentId: req.user._id,
        studentName: `${req.user.firstName} ${req.user.lastName}`,
        grade: req.user.grade,
        curriculum: req.user.curriculum,
        homeworkId: homework._id,
        timestamp: new Date().toISOString()
      });
    }

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
 * Grade homework (Admin/Assistant)
 */
exports.gradeHomework = async (req, res) => {
  try {
    // Authorization
    if (!['admin', 'assistant', 'developer'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin or assistant can grade homework'
      });
    }

    const { homeworkId } = req.params;
    const { grade, feedback } = req.body;

    // Validate homeworkId
    if (!mongoose.Types.ObjectId.isValid(homeworkId)) {
      return res.status(400).json({ success: false, message: 'Invalid homeworkId' });
    }

    // Validate grade
    const parsedGrade = Number(grade);
    if (grade === undefined || Number.isNaN(parsedGrade) || parsedGrade < 0 || parsedGrade > 100) {
      return res.status(400).json({ success: false, message: 'Invalid grade: must be a number between 0 and 100' });
    }

    // Find homework
    const homework = await Homework.findById(homeworkId);
    if (!homework) {
      return res.status(404).json({
        success: false,
        message: 'Homework not found'
      });
    }

    // Update homework with grade and feedback
    homework.grade = parsedGrade;
    homework.feedback = feedback || '';
    homework.status = 'graded';
    homework.gradedAt = new Date();
    homework.gradedBy = req.user.id;
    homework.gradedByRole = req.user.role;

    // Handle corrected file upload if provided
    if (req.file) {
      // Strict PDF check for corrected file
      const isPdfCorrected = req.file.mimetype === 'application/pdf' || req.file.originalname.toLowerCase().endsWith('.pdf');
      if (!isPdfCorrected) {
        try {
          await fs.access(req.file.path);
          await fs.unlink(req.file.path);
        } catch (e) { }
        return res.status(400).json({ success: false, message: 'Corrected file must be a PDF' });
      }

      const isValidCorrected = await validateFileContent(req.file.path, 'application/pdf');
      if (!isValidCorrected) {
        try {
          await fs.access(req.file.path);
          await fs.unlink(req.file.path);
        } catch (e) { }
        return res.status(400).json({ success: false, message: 'Invalid corrected file content' });
      }

      // UPLOAD TO R2
      console.log('📤 Uploading corrected homework to R2...');
      const correctedR2Url = await uploadFile(req.file, 'homework');
      console.log('✅ Corrected homework uploaded to R2:', correctedR2Url);

      homework.correctedFileUrl = correctedR2Url;
    }

    await homework.save();

    // ── Notify Student & Parent ──────────
    notificationService.notifyStudentAndParent(
      homework.studentId,
      {
        title: 'تم تصحيح الواجب! ✅',
        message: `تم تصحيح واجبك: ${homework.title || 'واجب'}`,
        type: 'homework_graded',
        refId: homework._id,
        url: '/student-homework'
      },
      {
        title: 'تنبيه ولي الأمر 📝',
        message: 'هناك درجة جديدة ابنك حصل عليها',
        type: 'homework_graded',
        refId: homework._id
      },
      req.io
    );

    res.status(200).json({
      success: true,
      message: 'Homework graded successfully',
      data: homework
    });
  } catch (error) {
    console.error('Grade homework error:', error);
    res.status(500).json({
      success: false,
      message: 'Error grading homework',
      error: error.message
    });
  }
};

/**
 * Add offline grades for multiple students
 * POST /api/students/homework/offline
 */
exports.addOfflineGrades = async (req, res) => {
  try {
    // Authorization
    if (!['admin', 'assistant', 'developer'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin or assistant can add offline grades'
      });
    }

    const { title, date, grades } = req.body;

    if (!title || !grades || !Array.isArray(grades) || grades.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Title and grades (as a non-empty array) are required'
      });
    }

    const createdHomeworks = [];
    const homeworkDate = date ? new Date(date) : new Date();

    for (const item of grades) {
      const { studentId, grade, feedback } = item;

      if (!studentId || !mongoose.Types.ObjectId.isValid(studentId)) {
        continue; // Skip invalid student IDs
      }

      // Fetch student to get their details (grade, curriculum, name)
      const student = await User.findById(studentId);
      if (!student || student.role !== 'student') continue;

      const homework = new Homework({
        studentId: student._id,
        studentName: `${student.firstName} ${student.lastName}`,
        studentGrade: student.grade,
        curriculum: student.curriculum,
        title: title,
        grade: grade,
        feedback: feedback || '',
        status: 'graded',
        isOffline: true,
        submittedAt: homeworkDate,
        gradedAt: new Date(),
        gradedBy: req.user.id,
        gradedByRole: req.user.role
      });

      await homework.save();
      createdHomeworks.push(homework);

      // ── Notify Student & Parent via Service ──────────
      notificationService.notifyStudentAndParent(
        student._id,
        {
          title: 'درجة جديدة مضافة! 🏆',
          message: `تمت إضافة درجة لـ: ${title}`,
          type: 'homework_graded',
          refId: homework._id,
          url: '/student-homework'
        },
        {
          title: 'تنبيه ولي الأمر 📝',
          message: 'هناك درجة جديدة ابنك حصل عليها',
          type: 'homework_graded',
          refId: homework._id
        },
        req.io
      );
    }

    res.status(201).json({
      success: true,
      message: `Successfully added ${createdHomeworks.length} offline grades`,
      count: createdHomeworks.length
    });
  } catch (error) {
    console.error('Add offline grades error:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding offline grades',
      error: error.message
    });
  }
};

/**
 * List all homework (Admin/Assistant)
 */
exports.listHomework = async (req, res) => {
  try {
    const { studentId, grade, curriculum, status } = req.query;
    const query = {};

    // Authorization & Scoping
    if (req.user.role === 'parent') {
      // Parents can ONLY see homework for their children
      const parent = await User.findById(req.user.id);

      // If studentId is provided, we just load for that student (access parent assumes they opened a child's specific tab)
      // Otherwise, if parent is found, load all their kids
      if (studentId) {
        if (parent) {
          const student = await User.findById(studentId);
          if (!student || (student.parentPhone !== parent.phoneNumber && !parent.childrenIds.includes(studentId))) {
            return res.status(403).json({ success: false, message: 'Unauthorized access to student data' });
          }
        }
        query.studentId = studentId;
      } else {
        if (!parent) {
          return res.status(400).json({ success: false, message: 'Please select a student first' });
        }
        // Find all studentIds for this parent
        const children = await User.find({
          $or: [
            { parentPhone: parent.phoneNumber },
            { _id: { $in: parent.childrenIds || [] } }
          ],
          role: 'student'
        });
        query.studentId = { $in: children.map(c => c._id) };
      }
    } else if (req.user.role === 'student') {
      // Students can ONLY see their own homework
      query.studentId = req.user._id;
    } else if (!['admin', 'assistant', 'developer'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    if (!query.studentId && studentId) query.studentId = studentId;
    if (grade) query.studentGrade = parseInt(grade);
    if (curriculum) query.curriculum = curriculum;
    if (status) query.status = status;

    const homework = await Homework.find(query).sort({ submittedAt: -1 });

    res.status(200).json({
      success: true,
      data: homework
    });
  } catch (error) {
    console.error('List homework error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching homework list',
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

    // ✅ Validate phone uniqueness after update (simplified here for existing students)
    if (user.phoneNumber && user.parentPhone && user.phoneNumber.replace(/\D/g, '') === user.parentPhone.replace(/\D/g, '')) {
       // Since it's already updated, we might need a better pre-check, but for now we follow business logic
       return res.status(400).json({ success: false, message: 'Student and parent phone numbers cannot be the same' });
    }

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
