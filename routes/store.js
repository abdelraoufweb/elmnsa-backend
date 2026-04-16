const express = require('express');
const router = express.Router();
const { authMiddleware, authorize } = require('../middleware/auth');
const storeController = require('../controllers/storeController');

// Products Routes
router.get('/products', storeController.getProducts);
router.get('/products/:id', storeController.getProduct);
router.post('/products', authMiddleware, authorize(['admin', 'developer']), storeController.createProduct);

// Orders Routes
router.post('/orders', authMiddleware, storeController.createOrder);
router.get('/orders', authMiddleware, storeController.getOrders);
router.get('/orders/:id', authMiddleware, storeController.getOrder);
router.put('/orders/:id', authMiddleware, authorize(['admin', 'developer']), storeController.updateOrderStatus);

// Store Statistics
router.get('/stats', authMiddleware, authorize(['admin', 'developer']), storeController.getStoreStats);

module.exports = router;
