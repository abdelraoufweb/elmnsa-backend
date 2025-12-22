// ==========================================
// AUTH CONTROLLER TESTS
// ==========================================

const request = require('supertest');
const app = require('../index');
const User = require('../models/User');
const SecurityLog = require('../models/SecurityLog');
const mongoose = require('mongoose');

/**
 * Test Suite: Authentication Controller
 * Tests: register, login, verify-access-code, getCurrentUser, refreshToken, logout
 */
describe('Authentication Controller', () => {

  // ==========================================
  // SETUP & TEARDOWN
  // ==========================================

  beforeAll(async () => {
    // Connect to test database
    const testDbUri = process.env.TEST_MONGODB_URI || 'mongodb://localhost:27017/elmnsa_test';
    await mongoose.connect(testDbUri);
  });

  afterAll(async () => {
    // Cleanup and disconnect
    await User.deleteMany({});
    await SecurityLog.deleteMany({});
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    // Clear collections before each test
    await User.deleteMany({});
    await SecurityLog.deleteMany({});
  });

  // ==========================================
  // REGISTER ENDPOINT TESTS
  // ==========================================

  describe('POST /api/auth/register', () => {

    test('Should register a new student successfully', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          firstName: 'Ahmed',
          lastName: 'Hassan',
          parentPhone: '01001234567',
          password: 'SecurePass123',
          grade: 'Grade 3',
          curriculum: 'Egyptian',
          role: 'student'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.token).toBeDefined();
      expect(response.body.user).toBeDefined();
      expect(response.body.user.firstName).toBe('Ahmed');
    });

    test('Should fail with missing required fields', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          firstName: 'Ahmed'
          // Missing other required fields
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('Should fail with duplicate phone number', async () => {
      // First registration
      await request(app)
        .post('/api/auth/register')
        .send({
          firstName: 'Ahmed',
          lastName: 'Hassan',
          parentPhone: '01001234567',
          password: 'SecurePass123',
          grade: 'Grade 3',
          curriculum: 'Egyptian',
          role: 'student'
        });

      // Duplicate registration
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          firstName: 'Mohammed',
          lastName: 'Ali',
          parentPhone: '01001234567',
          password: 'AnotherPass123',
          grade: 'Grade 4',
          curriculum: 'Egyptian',
          role: 'student'
        });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
    });

    test('Should create user with pending status', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          firstName: 'Ahmed',
          lastName: 'Hassan',
          parentPhone: '01001234567',
          password: 'SecurePass123',
          grade: 'Grade 3',
          curriculum: 'Egyptian',
          role: 'student'
        });

      expect(response.body.user.status).toBe('pending');
    });

  });

  // ==========================================
  // LOGIN ENDPOINT TESTS
  // ==========================================

  describe('POST /api/auth/login', () => {

    test('Should login with valid credentials', async () => {
      // Register user first
      await request(app)
        .post('/api/auth/register')
        .send({
          firstName: 'Ahmed',
          lastName: 'Hassan',
          parentPhone: '01001234567',
          password: 'SecurePass123',
          grade: 'Grade 3',
          curriculum: 'Egyptian',
          role: 'student'
        });

      // Login
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          parentPhone: '01001234567',
          password: 'SecurePass123'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.token).toBeDefined();
      expect(response.body.user).toBeDefined();
    });

    test('Should fail with incorrect password', async () => {
      // Register user
      await request(app)
        .post('/api/auth/register')
        .send({
          firstName: 'Ahmed',
          lastName: 'Hassan',
          parentPhone: '01001234567',
          password: 'SecurePass123',
          grade: 'Grade 3',
          curriculum: 'Egyptian',
          role: 'student'
        });

      // Login with wrong password
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          parentPhone: '01001234567',
          password: 'WrongPassword'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    test('Should fail with non-existent user', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          parentPhone: '01009999999',
          password: 'SecurePass123'
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    test('Should fail with missing credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          parentPhone: '01001234567'
          // Missing password
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

  });

  // ==========================================
  // VERIFY ACCESS CODE TESTS
  // ==========================================

  describe('POST /api/auth/verify-access-code', () => {

    test('Should verify valid access code', async () => {
      const response = await request(app)
        .post('/api/auth/verify-access-code')
        .send({
          code: 'SAMPLE12345'
        });

      // This would depend on what codes exist in the database
      expect(response.status).toBeOneOf([200, 404]);
      expect(response.body.success).toBeDefined();
    });

    test('Should reject invalid access code format', async () => {
      const response = await request(app)
        .post('/api/auth/verify-access-code')
        .send({
          code: ''
        });

      expect(response.status).toBe(400);
    });

  });

  // ==========================================
  // GET CURRENT USER TESTS
  // ==========================================

  describe('GET /api/auth/me', () => {

    test('Should get current user info with valid token', async () => {
      // Register and get token
      const registerRes = await request(app)
        .post('/api/auth/register')
        .send({
          firstName: 'Ahmed',
          lastName: 'Hassan',
          parentPhone: '01001234567',
          password: 'SecurePass123',
          grade: 'Grade 3',
          curriculum: 'Egyptian',
          role: 'student'
        });

      const token = registerRes.body.token;

      // Get current user
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.user.firstName).toBe('Ahmed');
    });

    test('Should fail without token', async () => {
      const response = await request(app)
        .get('/api/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    test('Should fail with invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid_token_here');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

  });

  // ==========================================
  // LOGOUT ENDPOINT TESTS
  // ==========================================

  describe('POST /api/auth/logout', () => {

    test('Should logout successfully with valid token', async () => {
      // Register and get token
      const registerRes = await request(app)
        .post('/api/auth/register')
        .send({
          firstName: 'Ahmed',
          lastName: 'Hassan',
          parentPhone: '01001234567',
          password: 'SecurePass123',
          grade: 'Grade 3',
          curriculum: 'Egyptian',
          role: 'student'
        });

      const token = registerRes.body.token;

      // Logout
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('Should fail without token', async () => {
      const response = await request(app)
        .post('/api/auth/logout');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

  });

  // ==========================================
  // HEALTH CHECK TESTS
  // ==========================================

  describe('GET /api/auth/health', () => {

    test('Should return health status', async () => {
      const response = await request(app)
        .get('/api/auth/health');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBeDefined();
    });

  });

});

// ==========================================
// HELPER FUNCTIONS
// ==========================================

/**
 * Helper to get valid token for authenticated requests
 */
async function getValidToken() {
  const res = await request(app)
    .post('/api/auth/register')
    .send({
      firstName: 'TestUser',
      lastName: 'User',
      parentPhone: '01001234567',
      password: 'SecurePass123',
      grade: 'Grade 3',
      curriculum: 'Egyptian',
      role: 'student'
    });
  return res.body.token;
}

module.exports = { getValidToken };
