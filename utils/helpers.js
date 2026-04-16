// ==========================================
// HELPER FUNCTIONS
// ==========================================

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

/**
 * Generate Unique ID
 */
const generateUniqueId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

/**
 * Generate Order ID (6-10 alphanumeric)
 */
const generateOrderId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const length = Math.floor(Math.random() * 5) + 6;
  let orderId = '';
  for (let i = 0; i < length; i++) {
    orderId += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return orderId;
};

/**
 * Generate Call Code (6 uppercase alphanumeric)
 */
const generateCallCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
};

/**
 * Generate Access Code
 */
const generateAccessCode = (length = 8) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

/**
 * Hash Password
 */
const hashPassword = (password) => {
  return crypto.createHash('sha256').update(password).digest('hex');
};

/**
 * Verify Password
 */
const verifyPassword = (password, hash) => {
  return hashPassword(password) === hash;
};

/**
 * Validate Phone Number
 */
const validatePhone = (phone) => {
  return /^[\+]?[\d\s\-\(\)]{10,}$/.test(phone);
};

/**
 * Validate Email
 */
const validateEmail = (email) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

/**
 * Extract YouTube Video ID
 */
const extractYouTubeId = (url) => {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s?]+)/,
    /^([a-zA-Z0-9_-]{11})$/
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
};

/**
 * Escape HTML
 */
const escapeHtml = (text) => {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
};

/**
 * Format Date
 */
const formatDate = (date) => {
  if (!date) return 'Unknown';
  const d = new Date(date);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString();
};

/**
 * Format Relative Time
 */
const formatRelativeTime = (date) => {
  if (!date) return 'Unknown';
  const d = new Date(date);
  const now = new Date();
  const diff = now - d;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'now';
};

/**
 * Deep Clone Object
 */
const deepClone = (obj) => {
  return JSON.parse(JSON.stringify(obj));
};

/**
 * Merge Objects
 */
const mergeObjects = (target, ...sources) => {
  return Object.assign(target, ...sources);
};

module.exports = {
  generateUniqueId,
  generateOrderId,
  generateCallCode,
  generateAccessCode,
  hashPassword,
  verifyPassword,
  validatePhone,
  validateEmail,
  extractYouTubeId,
  escapeHtml,
  formatDate,
  formatRelativeTime,
  deepClone,
  mergeObjects
};
