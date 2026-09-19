// ==========================================
// STORE CONTROLLER
// ==========================================

const Product = require('../models/Product');
const Order = require('../models/Order');
const { generateOrderId } = require('../utils/helpers');
const whatsappService = require('../services/whatsappService');

/**
 * Get all products
 */
exports.getProducts = async (req, res) => {
  try {
    const { category, search } = req.query;

    let query = {};
    if (category) query.category = category;
    if (search) {
      query.name = { $regex: search, $options: 'i' };
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
    const { name, description, price, category, imageUrl } = req.body;

    if (!name || !price || !category) {
      return res.status(400).json({
        success: false,
        message: 'Name, price, and category are required'
      });
    }

    const product = new Product({
      name,
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
 * Update product
 */
exports.updateProduct = async (req, res) => {
  try {
    const { name, description, price, category, imageUrl, purchaseLink } = req.body;
    const product = await Product.findById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
        error: 'NOT_FOUND'
      });
    }

    if (name !== undefined) product.name = name;
    if (description !== undefined) product.description = description;
    if (price !== undefined) product.price = parseFloat(price);
    if (category !== undefined) product.category = category;
    if (imageUrl !== undefined) product.imageUrl = imageUrl;
    if (purchaseLink !== undefined) product.purchaseLink = purchaseLink;
    product.updatedAt = Date.now();

    await product.save();

    res.status(200).json({
      success: true,
      message: 'Product updated successfully',
      data: product
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating product',
      error: error.message
    });
  }
};

/**
 * Delete product
 */
exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
        error: 'NOT_FOUND'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Product deleted successfully',
      data: { id: product._id }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting product',
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
    const orderItemsDetails = [];
    for (const item of items) {
      let productPrice = Number(item.price || 0);
      let productName = item.productName || 'Unknown Product';
      
      try {
        if (item.productId && item.productId.length === 24) {
          const product = await Product.findById(item.productId);
          if (product) {
            productPrice = product.price;
            productName = product.name;
          }
        }
      } catch (err) {
        // Fallback to provided price and name if product not in DB
      }

      // Security Check: Positive Quantity
      if (!item.quantity || item.quantity <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid quantity',
          error: 'INVALID_QUANTITY'
        });
      }

      total += productPrice * item.quantity;
      orderItemsDetails.push(`- ${productName} (الكمية: ${item.quantity})`);
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

    // Send WhatsApp notifications
    try {
      // 1. Notify Buyer
      const buyerMsg = `مرحباً ${req.user.fullName}،\n\nتم استلام طلبك بنجاح من المتجر! 🛒\n\n📌 رقم الطلب: ${orderId}\n💰 الإجمالي: ${total} جنيه\n\nشكراً لتسوقك معنا، سيتم التواصل معك قريباً.`;
      whatsappService.sendMessage(order.buyerPhone, buyerMsg, {
        type: 'store_order',
        recipientName: req.user.fullName,
        recipientType: req.user.role
      });

      // 2. Notify Admins
      const adminMsg = `🛒 *طلب جديد في المتجر!*\n\n📌 رقم الطلب: ${orderId}\n👤 المشتري: ${req.user.fullName}\n📱 رقم الهاتف: ${order.buyerPhone}\n💰 الإجمالي: ${total} جنيه\n\n📦 *المنتجات:*\n${orderItemsDetails.join('\n')}`;
      whatsappService.notifyAdmins(adminMsg, 'store_order');
    } catch (wsErr) {
      console.error('WhatsApp notification error on checkout:', wsErr);
    }

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
 * Get all orders (admin/assistant only)
 */
exports.getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find({}).sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: orders,
      count: orders.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching all orders',
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
    const { id } = req.params;
    
    let order;
    if (id && id.length === 24) {
      order = await Order.findByIdAndUpdate(id, { status }, { new: true, runValidators: true });
    }
    
    // Fallback: Try finding by the custom orderId (e.g. ORD-123456)
    if (!order) {
      order = await Order.findOneAndUpdate(
        { orderId: id },
        { status },
        { new: true, runValidators: true }
      );
    }

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
