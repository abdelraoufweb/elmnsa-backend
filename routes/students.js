// ==========================================
// STUDENT ROUTES
// ==========================================

const express = require('express');
const router = express.Router();
const { authMiddleware, authorize } = require('../middleware/auth');
const studentController = require('../controllers/studentController');
const { uploadHomework, uploadWorksheet } = require('../middleware/fileUpload');

// WORKSHEET ROUTES
// Get all worksheets (Student/Admin/Assistant)
router.get('/worksheets', authMiddleware, studentController.getWorksheets);

// Get children for a parent
router.get('/parent/children', authMiddleware, studentController.getParentChildren);

// Upload worksheet (Admin/Assistant/Developer)
router.post('/worksheets', authMiddleware, authorize(['admin', 'assistant', 'developer']), uploadWorksheet.single('file'), studentController.uploadWorksheet);

// Delete worksheet (Admin/Assistant/Developer)
router.delete('/worksheets/:id', authMiddleware, authorize(['admin', 'assistant', 'developer']), studentController.deleteWorksheet);

// HOMEWORK ROUTES (Before :studentId to avoid collision)
// Upload homework (Student)
router.post('/homework', authMiddleware, uploadHomework.single('file'), studentController.uploadHomework);

// List homework (Publicly accessible with auth, scoping handled in controller)
router.get('/homework', authMiddleware, studentController.listHomework);

// Grade homework (Admin/Assistant)
router.post('/homework/:homeworkId/grade', authMiddleware, authorize(['admin', 'assistant', 'developer']), uploadHomework.single('correctedFile'), studentController.gradeHomework);

// Get student's OWN homework
router.get('/homework/my', authMiddleware, studentController.getHomework); // Or reuse getHomework if it defaults to 'my'


// PROFILE ROUTES (Before :studentId)
// Get own profile
router.get('/profile', authMiddleware, studentController.getProfile);

// Update own profile
router.put('/profile', authMiddleware, studentController.updateProfile);


// STUDENT MANAGEMENT ROUTES

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
