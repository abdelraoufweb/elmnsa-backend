const express = require('express');
const router = express.Router();
const { authMiddleware, authorize } = require('../middleware/auth');
const profileRequestController = require('../controllers/profileRequestController');

// Submit request (Student)
router.post('/', authMiddleware, profileRequestController.createRequest);

// List requests (Admin/Assistant)
router.get('/', authMiddleware, authorize(['admin', 'assistant', 'developer']), profileRequestController.listRequests);

// Resolve request (Admin/Assistant)
router.post('/:requestId/resolve', authMiddleware, authorize(['admin', 'assistant', 'developer']), profileRequestController.resolveRequest);

module.exports = router;
