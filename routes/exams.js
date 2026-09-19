// ==========================================
// EXAM ROUTES
// ==========================================

const express = require('express');
const router = express.Router();
const examController = require('../controllers/examController');
const { authMiddleware } = require('../middleware/auth');
const { uploadProfile } = require('../middleware/fileUpload');

// All routes require authentication
router.use(authMiddleware);

// ──────────────────────────────────────────────────────────
// STUDENT ROUTES (must be before /:id to avoid matching id='student')
// ──────────────────────────────────────────────────────────

// List active exams for student's grade
router.get('/student', examController.listExamsForStudent);

// Get all exam results for the student
router.get('/student/results', examController.getStudentResults);

// ──────────────────────────────────────────────────────────
// ADMIN ROUTES (Exams CRUD)
// ──────────────────────────────────────────────────────────

// Create and List exams
router.post('/', examController.createExam);
router.get('/', examController.listExams);

// Update and Delete exams
router.put('/:id', examController.updateExam);
router.delete('/:id', examController.deleteExam);

// ──────────────────────────────────────────────────────────
// ADMIN ROUTES (Questions CRUD)
// ──────────────────────────────────────────────────────────

// Add question with optional image upload
// Using uploadProfile middleware as it provides the exact 5MB + images-only config we need
router.post('/:id/questions', uploadProfile.single('image'), examController.addQuestion);

// List questions for an exam
router.get('/:id/questions', examController.listQuestions);

// Update question with optional new image
router.put('/:id/questions/:qid', uploadProfile.single('image'), examController.updateQuestion);

// Delete question
router.delete('/:id/questions/:qid', examController.deleteQuestion);

// Admin view results for a specific exam
router.get('/:id/results', examController.getExamResults);

// ──────────────────────────────────────────────────────────
// STUDENT EXAM ATTEMPT ROUTES
// ──────────────────────────────────────────────────────────

// Start attempt (verifies code)
router.post('/:id/attempt/start', examController.startAttempt);

// Retake attempt (bypasses code)
router.post('/:id/attempt/retake', examController.retakeAttempt);

// Submit module
router.post('/:id/attempt/:attemptId/submit-module', examController.submitModule);

// Continue to module 2 (after module 1)
router.post('/:id/attempt/:attemptId/continue', examController.continueToModule2);

// Finish early (skip module 2)
router.post('/:id/attempt/:attemptId/finish-module1', examController.finishAfterModule1);

module.exports = router;
