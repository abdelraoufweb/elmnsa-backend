// ==========================================
// AI CONTROLLER
// ==========================================

const axios = require('axios');
const AccessCode = require('../models/AccessCode');

/**
 * Get AI response
 */
exports.getResponse = async (req, res) => {
  try {
    const { message, accessCode } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    // Verify access code if provided
    if (accessCode) {
      const access = await AccessCode.findOne({ code: accessCode });
      if (!access) {
        return res.status(403).json({
          success: false,
          message: 'Invalid access code'
        });
      }

      if (access.expiresAt && access.expiresAt < new Date()) {
        return res.status(403).json({
          success: false,
          message: 'Access code has expired'
        });
      }
    }

    // Call external AI service (if available)
    // For now, return a placeholder response
    const aiResponse = {
      response: `Processing your request: ${message}`,
      timestamp: new Date(),
      userId: req.user._id
    };

    res.status(200).json({
      success: true,
      data: aiResponse
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error processing AI request',
      error: error.message
    });
  }
};

/**
 * Generate access code
 */
exports.generateAccessCode = async (req, res) => {
  try {
    const { duration } = req.body;

    // Generate random 6-character code
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    let expiresAt = null;
    if (duration) {
      expiresAt = new Date(Date.now() + duration * 60 * 1000);
    }

    const accessCode = new AccessCode({
      code,
      createdBy: req.user._id,
      expiresAt
    });

    await accessCode.save();

    res.status(201).json({
      success: true,
      message: 'Access code generated successfully',
      data: {
        code,
        expiresAt
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error generating access code',
      error: error.message
    });
  }
};

/**
 * Verify access code
 */
exports.verifyAccessCode = async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Access code is required'
      });
    }

    const accessCode = await AccessCode.findOne({ code });

    if (!accessCode) {
      return res.status(404).json({
        success: false,
        message: 'Invalid access code'
      });
    }

    if (accessCode.expiresAt && accessCode.expiresAt < new Date()) {
      return res.status(403).json({
        success: false,
        message: 'Access code has expired'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Access code is valid',
      data: {
        isValid: true,
        expiresAt: accessCode.expiresAt
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error verifying access code',
      error: error.message
    });
  }
};

/**
 * Get AI conversation history
 */
exports.getConversationHistory = async (req, res) => {
  try {
    // Placeholder for conversation history
    const history = {
      userId: req.user._id,
      messages: [],
      totalMessages: 0
    };

    res.status(200).json({
      success: true,
      data: history
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching conversation history',
      error: error.message
    });
  }
};

/**
 * Clear conversation
 */
exports.clearConversation = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      message: 'Conversation cleared successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error clearing conversation',
      error: error.message
    });
  }
};
