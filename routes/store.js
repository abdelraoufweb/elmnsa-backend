const express = require('express');
const router = express.Router();
const { authMiddleware, authorize } = require('../middleware/auth');
const storeController = require('../controllers/storeController');

// Products Routes
router.get('/products', storeController.getProducts);
router.get('/products/:id', storeController.getProduct);
router.post('/products', authMiddleware, authorize(['admin', 'developer', 'assistant']), storeController.createProduct);
router.put('/products/:id', authMiddleware, authorize(['admin', 'developer', 'assistant']), storeController.updateProduct);
router.delete('/products/:id', authMiddleware, authorize(['admin', 'developer', 'assistant']), storeController.deleteProduct);

// Orders Routes
router.post('/orders', authMiddleware, storeController.createOrder);
router.get('/orders', authMiddleware, storeController.getOrders);
router.get('/orders/all', authMiddleware, authorize(['admin', 'developer', 'assistant']), storeController.getAllOrders);
router.get('/orders/:id', authMiddleware, storeController.getOrder);
router.put('/orders/:id', authMiddleware, authorize(['admin', 'developer', 'assistant']), storeController.updateOrderStatus);

// Store Statistics
router.get('/stats', authMiddleware, authorize(['admin', 'developer']), storeController.getStoreStats);

module.exports = router;
