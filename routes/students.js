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

// Add offline grades (Admin/Assistant/Developer)
router.post('/homework/offline', authMiddleware, authorize(['admin', 'assistant', 'developer']), studentController.addOfflineGrades);

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
router.get('/', authMiddleware, authorize(['admin', 'assistant', 'developer']), studentController.listStudents);

// Get student details
router.get('/:studentId', authMiddleware, authorize(['admin', 'assistant', 'developer']), studentController.getStudent);

// Update student (Admin/Assistant/Developer only)
router.put('/:studentId', authMiddleware, authorize(['admin', 'assistant', 'developer']), studentController.updateStudent);

// Delete student (Admin/Developer only)
router.delete('/:studentId', authMiddleware, authorize(['admin', 'developer']), studentController.deleteStudent);

// Approve student (Admin/Developer only)
router.post('/:studentId/approve', authMiddleware, authorize(['admin', 'developer']), studentController.approveStudent);

// Block student (Admin/Developer only)
router.post('/:studentId/block', authMiddleware, authorize(['admin', 'developer']), studentController.blockStudent);

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
