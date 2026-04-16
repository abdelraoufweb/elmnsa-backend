// ==========================================
// JEST SETUP FILE
// ==========================================

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key';
process.env.ENCRYPTION_KEY = 'test-encryption-key';
process.env.MONGODB_URI = 'mongodb://localhost:27017/elmnsa_test';
process.env.TEST_MONGODB_URI = 'mongodb://localhost:27017/elmnsa_test';

// Global test configuration
global.testTimeout = 30000;

// Suppress console logs during tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
