// ==========================================
// THEME CONTROLLER
// ==========================================

const Theme = require('../models/Theme');
const User = require('../models/User');

/**
 * Get all available themes
 * GET /api/themes
 */
exports.listThemes = async (req, res) => {
  try {
    const themes = [
      { id: 'default', name: 'Default', description: 'Default theme' },
      { id: 'theme-dark', name: 'Dark', description: 'Dark color scheme' },
      { id: 'theme-light', name: 'Light', description: 'Light color scheme' },
      { id: 'theme-ocean', name: 'Ocean', description: 'Ocean blue colors' },
      { id: 'theme-sunset', name: 'Sunset', description: 'Warm sunset colors' },
      { id: 'theme-purple', name: 'Purple', description: 'Purple theme' },
      { id: 'theme-forest', name: 'Forest', description: 'Green forest colors' },
      { id: 'assistant-theme', name: 'Assistant', description: 'Assistant purple theme' }
    ];

    res.status(200).json({
      success: true,
      data: themes
    });
  } catch (error) {
    console.error('List themes error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch themes',
      error: error.message
    });
  }
};

/**
 * Get user's current theme
 * GET /api/themes/user/:userId
 */
exports.getUserTheme = async (req, res) => {
  try {
    const theme = await Theme.findOne({ userId: req.params.userId })
      .populate('appliedBy', 'firstName lastName role');

    if (!theme) {
      return res.status(200).json({
        success: true,
        data: {
          themeName: 'theme-dark',  // Default theme
          message: 'Using default theme'
        }
      });
    }

    res.status(200).json({
      success: true,
      data: theme
    });
  } catch (error) {
    console.error('Get user theme error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user theme',
      error: error.message
    });
  }
};

/**
 * Apply theme to user
 * POST /api/themes/apply
 */
exports.applyTheme = async (req, res) => {
  try {
    const { userId, themeName } = req.body;

    // Authorization - can apply theme to self or admin/assistant/developer can apply to others
    if (userId !== req.user.id && !['admin', 'assistant', 'developer'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized to apply theme'
      });
    }

    // Validation
    if (!themeName) {
      return res.status(400).json({
        success: false,
        message: 'Theme name required'
      });
    }

    const validThemes = ['default', 'theme-dark', 'theme-light', 'theme-ocean', 'theme-sunset', 'theme-purple', 'theme-forest', 'assistant-theme'];
    if (!validThemes.includes(themeName)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid theme name'
      });
    }

    // Create or update theme (skip user existence check — auth middleware already verified the requester)
    let theme = await Theme.findOne({ userId });
    if (!theme) {
      theme = new Theme({
        userId,
        themeName,
        appliedBy: req.user.id,
        appliedByRole: req.user.role
      });
    } else {
      theme.themeName = themeName;
      theme.appliedBy = req.user.id;
      theme.appliedByRole = req.user.role;
      theme.updatedAt = new Date();
    }

    await theme.save();

    res.status(200).json({
      success: true,
      message: 'Theme applied successfully',
      data: {
        themeName: theme.themeName,
        appliedAt: theme.appliedAt,
        appliedBy: `${req.user.firstName} ${req.user.lastName}`
      }
    });
  } catch (error) {
    console.error('Apply theme error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to apply theme',
      error: error.message
    });
  }
};

/**
 * Reset theme to default
 * POST /api/themes/reset/:userId
 */
exports.resetTheme = async (req, res) => {
  try {
    // Authorization
    if (req.params.userId !== req.user.id && !['admin', 'developer'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    await Theme.deleteOne({ userId: req.params.userId });

    res.status(200).json({
      success: true,
      message: 'Theme reset to default'
    });
  } catch (error) {
    console.error('Reset theme error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset theme',
      error: error.message
    });
  }
};
