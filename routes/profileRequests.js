const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const profileRequestController = require('../controllers/profileRequestController');

// Submit request (Student)
router.post('/', authMiddleware, profileRequestController.createRequest);

// List requests (Admin/Assistant)
router.get('/', authMiddleware, profileRequestController.listRequests);

// Resolve request (Admin/Assistant)
router.post('/:requestId/resolve', authMiddleware, profileRequestController.resolveRequest);

module.exports = router;
