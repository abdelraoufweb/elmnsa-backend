const express = require('express');
const router = express.Router();
const liveController = require('../controllers/liveController');
const { authMiddleware } = require('../middleware/auth');

router.get('/', authMiddleware, liveController.getActiveSessions);

module.exports = router;
