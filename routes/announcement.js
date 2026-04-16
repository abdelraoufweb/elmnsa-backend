const express = require('express');
const router = express.Router();
const announcementController = require('../controllers/announcementController');
const { authMiddleware, authorize } = require('../middleware/auth');

router.get('/', authMiddleware, announcementController.getAnnouncements);
router.post('/', authMiddleware, authorize(['admin', 'assistant', 'developer']), announcementController.createAnnouncement);
router.delete('/:id', authMiddleware, authorize(['admin', 'developer']), announcementController.deleteAnnouncement);

module.exports = router;
