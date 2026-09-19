// ==========================================
// EXAM CODE CONTROLLER
// ==========================================

const ExamAccessCode = require('../models/ExamAccessCode');
const { v4: uuidv4 } = require('uuid');

const ADMIN_ROLES = ['admin', 'assistant', 'developer'];

/**
 * Generate a batch of exam access codes
 * POST /api/exam-codes/generate
 * Body: { count, prefix }
 */
exports.generateCodes = async (req, res) => {
  try {
    if (!ADMIN_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const { count = 10, prefix = 'EXAM-' } = req.body;
    const numCount = parseInt(count, 10);
    
    if (isNaN(numCount) || numCount <= 0 || numCount > 1000) {
      return res.status(400).json({ success: false, message: 'Count must be between 1 and 1000' });
    }

    const generationBatchId = uuidv4();
    const codesToInsert = [];

    for (let i = 0; i < numCount; i++) {
      // Generate a random string: prefix + 8 alphanumeric uppercase characters
      const randomPart = Math.random().toString(36).substring(2, 10).toUpperCase();
      const codeStr = `${prefix}${randomPart}`;
      
      codesToInsert.push({
        code: codeStr,
        generationBatchId,
        createdBy: req.user.id
      });
    }

    // Insert all codes
    await ExamAccessCode.insertMany(codesToInsert);

    res.status(201).json({
      success: true,
      message: `Generated ${numCount} codes successfully.`,
      data: {
        generationBatchId,
        count: numCount
      }
    });

  } catch (error) {
    console.error('generateCodes error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * List exam access codes (with pagination and filters)
 * GET /api/exam-codes
 * Query: page, limit, batchId, status (sold/unsold), search (code)
 */
exports.listCodes = async (req, res) => {
  try {
    if (!ADMIN_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const { page = 1, limit = 50, batchId, status, search } = req.query;
    
    const filter = {};
    if (batchId) {
      filter.generationBatchId = batchId;
    }
    if (status === 'sold') {
      filter.isSold = true;
    } else if (status === 'unsold') {
      filter.isSold = false;
    }
    if (search) {
      filter.code = { $regex: search.trim(), $options: 'i' };
    }

    const skip = (parseInt(page, 10) - 1) * parseInt(limit, 10);

    const codes = await ExamAccessCode.find(filter)
      .populate('createdBy', 'firstName lastName')
      .populate('lockedToExamId', 'title type stage')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit, 10))
      .lean();

    const total = await ExamAccessCode.countDocuments(filter);

    res.json({
      success: true,
      data: codes,
      pagination: {
        total,
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        pages: Math.ceil(total / parseInt(limit, 10))
      }
    });
  } catch (error) {
    console.error('listCodes error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Mark a code as sold
 * PATCH /api/exam-codes/:id/sell
 */
exports.sellCode = async (req, res) => {
  try {
    if (!ADMIN_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const code = await ExamAccessCode.findById(req.params.id);
    if (!code) {
      return res.status(404).json({ success: false, message: 'Code not found' });
    }

    if (code.isSold) {
      return res.status(400).json({ success: false, message: 'Code is already marked as sold' });
    }

    code.isSold = true;
    code.soldAt = new Date();
    await code.save();

    res.json({ success: true, data: code });
  } catch (error) {
    console.error('sellCode error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Disable a code (Stop Access)
 * PATCH /api/exam-codes/:id/stop
 */
exports.stopCode = async (req, res) => {
  try {
    if (!ADMIN_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const code = await ExamAccessCode.findById(req.params.id);
    if (!code) {
      return res.status(404).json({ success: false, message: 'Code not found' });
    }

    code.isDisabled = !code.isDisabled; // Toggle
    code.disabledAt = code.isDisabled ? new Date() : null;
    code.disabledBy = code.isDisabled ? req.user.id : null;
    
    await code.save();

    res.json({ success: true, data: code, message: code.isDisabled ? 'Code disabled' : 'Code re-enabled' });
  } catch (error) {
    console.error('stopCode error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Delete a code (Hard Delete) - only if unused
 * DELETE /api/exam-codes/:id
 */
exports.deleteCode = async (req, res) => {
  try {
    if (!ADMIN_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const code = await ExamAccessCode.findById(req.params.id);
    if (!code) {
      return res.status(404).json({ success: false, message: 'Code not found' });
    }

    if (code.isUsed) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot delete a code that has already been used by a student. Use "Stop Access" instead.' 
      });
    }

    await ExamAccessCode.findByIdAndDelete(req.params.id);

    res.json({ success: true, message: 'Code deleted successfully' });
  } catch (error) {
    console.error('deleteCode error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Mark an entire batch of codes as saved to PDF
 * PATCH /api/exam-codes/batch/:batchId/mark-pdf
 */
exports.markBatchPdf = async (req, res) => {
  try {
    if (!ADMIN_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    const { batchId } = req.params;
    if (!batchId) {
      return res.status(400).json({ success: false, message: 'Batch ID is required' });
    }

    const result = await ExamAccessCode.updateMany(
      { generationBatchId: batchId },
      { $set: { savedInPdf: true } }
    );

    res.json({ 
      success: true, 
      message: `Marked ${result.modifiedCount} codes as saved in PDF.`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('markBatchPdf error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Get distinct batches for filter dropdown
 * GET /api/exam-codes/batches
 */
exports.getBatches = async (req, res) => {
  try {
    if (!ADMIN_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Unauthorized' });
    }

    // Get unique batch IDs, their creation dates, and counts
    const batches = await ExamAccessCode.aggregate([
      {
        $group: {
          _id: '$generationBatchId',
          createdAt: { $min: '$createdAt' },
          count: { $sum: 1 },
          savedInPdf: { $first: '$savedInPdf' } // if one is true, likely all are, but we'll just grab first
        }
      },
      { $sort: { createdAt: -1 } }
    ]);

    res.json({ success: true, data: batches });
  } catch (error) {
    console.error('getBatches error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
