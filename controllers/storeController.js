// ==========================================
// STORE CONTROLLER
// ==========================================

const Product = require('../models/Product');
const Order = require('../models/Order');
const { generateOrderId } = require('../utils/helpers');

/**
 * Get all products
 */
exports.getProducts = async (req, res) => {
  try {
    const { category, search } = req.query;

    let query = {};
    if (category) query.category = category;
    if (search) {
      query.title = { $regex: search, $options: 'i' };
    }

    const products = await Product.find(query)
      .populate('createdBy', 'fullName')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: products,
      count: products.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching products',
      error: error.message
    });
  }
};

/**
 * Get single product
 */
exports.getProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate('createdBy', 'fullName');

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
        error: 'NOT_FOUND'
      });
    }

    // Increment views
    product.views += 1;
    await product.save();

    res.status(200).json({
      success: true,
      data: product
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching product',
      error: error.message
    });
  }
};

/**
 * Create product
 */
exports.createProduct = async (req, res) => {
  try {
    const { title, description, price, category, imageUrl } = req.body;

    if (!title || !price || !category) {
      return res.status(400).json({
        success: false,
        message: 'Title, price, and category are required'
      });
    }

    const product = new Product({
      title,
      description,
      price: parseFloat(price),
      category,
      imageUrl,
      createdBy: req.user._id
    });

    await product.save();

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      data: product
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating product',
      error: error.message
    });
  }
};

/**
 * Create order
 */
exports.createOrder = async (req, res) => {
  try {
    const { items, buyerPhone, buyerEmail, buyerAddress } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Items required',
        error: 'MISSING_ITEMS'
      });
    }

    // Calculate total and validate products
    let total = 0;
    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: `Product ${item.productId} not found`,
          error: 'PRODUCT_NOT_FOUND'
        });
      }

      // Security Check: Positive Quantity
      if (!item.quantity || item.quantity <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid quantity',
          error: 'INVALID_QUANTITY'
        });
      }

      total += product.price * item.quantity;
    }

    // Create order
    const orderId = generateOrderId();

    const order = new Order({
      orderId,
      buyerId: req.user._id,
      buyerRole: req.user.role,
      buyerName: req.user.fullName,
      items,
      total,
      buyerPhone: buyerPhone || req.user.phoneNumber,
      buyerEmail,
      buyerAddress,
      status: 'pending'
    });

    await order.save();

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: order
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error creating order',
      error: error.message
    });
  }
};

/**
 * Get orders for user
 */
exports.getOrders = async (req, res) => {
  try {
    const orders = await Order.find({ buyerId: req.user._id }).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: orders,
      count: orders.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching orders',
      error: error.message
    });
  }
};

/**
 * Get single order
 */
exports.getOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Verify user owns this order
    if (order.buyerId.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access'
      });
    }

    res.status(200).json({
      success: true,
      data: order
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching order',
      error: error.message
    });
  }
};

/**
 * Update order status
 */
exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Order status updated successfully',
      data: order
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating order',
      error: error.message
    });
  }
};

/**
 * Get store statistics
 */
exports.getStoreStats = async (req, res) => {
  try {
    const totalProducts = await Product.countDocuments();
    const totalOrders = await Order.countDocuments();
    const totalRevenue = await Order.aggregate([
      { $group: { _id: null, total: { $sum: '$total' } } }
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalProducts,
        totalOrders,
        totalRevenue: totalRevenue[0]?.total || 0
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching store stats',
      error: error.message
    });
  }
};
