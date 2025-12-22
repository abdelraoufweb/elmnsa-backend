// ==========================================
// STUDENT ROUTES
// ==========================================

const express = require('express');
const router = express.Router();
const { authMiddleware, authorize } = require('../middleware/auth');
const studentController = require('../controllers/studentController');

// List all students (Admin/Assistant/Developer only)
/**
 * GET /api/students?grade=10&curriculum=american&status=approved&page=1&limit=20
 */
router.get('/', authMiddleware, studentController.listStudents);

// Get student details
/**
 * GET /api/students/:studentId
 */
router.get('/:studentId', authMiddleware, studentController.getStudent);

// Update student (Admin/Assistant/Developer only)
/**
 * PUT /api/students/:studentId
 */
router.put('/:studentId', authMiddleware, studentController.updateStudent);

// Delete student (Admin/Developer only)
/**
 * DELETE /api/students/:studentId
 */
router.delete('/:studentId', authMiddleware, studentController.deleteStudent);

// Approve student (Admin/Developer only)
/**
 * POST /api/students/:studentId/approve
 */
router.post('/:studentId/approve', authMiddleware, studentController.approveStudent);

// Block student (Admin/Developer only)
/**
 * POST /api/students/:studentId/block
 */
router.post('/:studentId/block', authMiddleware, studentController.blockStudent);

// Apply theme to student
/**
 * POST /api/students/:studentId/apply-theme
 */
router.post('/:studentId/apply-theme', authMiddleware, studentController.applyTheme);

// Get student's theme
/**
 * GET /api/students/:studentId/theme
 */
router.get('/:studentId/theme', authMiddleware, studentController.getStudentTheme);

module.exports = router;
