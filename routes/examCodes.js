// ==========================================
// EXAM CODE ROUTES
// ==========================================

const express = require('express');
const router = express.Router();
const examCodeController = require('../controllers/examCodeController');
const { authMiddleware } = require('../middleware/auth');

// All routes require authentication
router.use(authMiddleware);

// Generate new batch of codes
router.post('/generate', examCodeController.generateCodes);

// List codes (with pagination and filters)
router.get('/', examCodeController.listCodes);

// Get distinct batches (for filtering)
router.get('/batches', examCodeController.getBatches);

// Mark code as sold
router.patch('/:id/sell', examCodeController.sellCode);

// Stop / disable a code
router.patch('/:id/stop', examCodeController.stopCode);

// Hard delete a code (if unused)
router.delete('/:id', examCodeController.deleteCode);

// Mark an entire batch as saved to PDF
router.patch('/batch/:batchId/mark-pdf', examCodeController.markBatchPdf);

module.exports = router;
