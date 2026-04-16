// ==========================================
// EXAMPLE ROUTE - Copy this pattern for your routes
// ==========================================

const express = require('express');
const router = express.Router();

/**
 * Example GET route
 * GET /api/example
 */
router.get('/', (req, res) => {
  try {
    res.json({
      message: 'Example route is working',
      timestamp: new Date()
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

/**
 * Example POST route
 * POST /api/example
 */
router.post('/', (req, res) => {
  try {
    const { data } = req.body;

    if (!data) {
      return res.status(400).json({
        error: 'Data is required'
      });
    }

    res.status(201).json({
      message: 'Data received',
      data
    });
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
});

module.exports = router;
