const express = require('express');
const router = express.Router();
const scheduleController = require('../controllers/scheduleController');
const { authMiddleware, authorize } = require('../middleware/auth');

router.get('/', authMiddleware, scheduleController.getSchedules);
router.post('/', authMiddleware, authorize(['admin', 'assistant', 'developer']), scheduleController.createSchedule);
router.patch('/:id', authMiddleware, authorize(['admin', 'assistant', 'developer']), scheduleController.updateSchedule);
router.delete('/:id', authMiddleware, authorize(['admin', 'developer']), scheduleController.deleteSchedule);

module.exports = router;
