// ==========================================
// THEME CONTROLLER TESTS
// ==========================================

const request = require('supertest');
const app = require('../index');
const User = require('../models/User');
const Theme = require('../models/Theme');
const mongoose = require('mongoose');

describe('Theme Controller', () => {

  let adminToken;
  let assistantToken;
  let studentToken;
  let studentId;

  // ==========================================
  // SETUP & TEARDOWN
  // ==========================================

  beforeAll(async () => {
    const testDbUri = process.env.TEST_MONGODB_URI || 'mongodb://localhost:27017/elmnsa_test';
    await mongoose.connect(testDbUri);

    // Create admin
    const adminRes = await request(app)
      .post('/api/auth/register')
      .send({
        firstName: 'Admin',
        lastName: 'User',
        parentPhone: '01001111111',
        password: 'AdminPass123',
        grade: 'N/A',
        curriculum: 'N/A',
        role: 'admin'
      });
    adminToken = adminRes.body.token;

    // Create assistant
    const assistantRes = await request(app)
      .post('/api/auth/register')
      .send({
        firstName: 'Assistant',
        lastName: 'Teacher',
        parentPhone: '01003333333',
        password: 'AssistantPass123',
        grade: 'N/A',
        curriculum: 'N/A',
        role: 'assistant'
      });
    assistantToken = assistantRes.body.token;

    // Create student
    const studentRes = await request(app)
      .post('/api/auth/register')
      .send({
        firstName: 'Ahmed',
        lastName: 'Student',
        parentPhone: '01002222222',
        password: 'StudentPass123',
        grade: 'Grade 3',
        curriculum: 'Egyptian',
        role: 'student'
      });
    studentToken = studentRes.body.token;
    studentId = studentRes.body.user._id;
  });

  afterAll(async () => {
    await User.deleteMany({});
    await Theme.deleteMany({});
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await Theme.deleteMany({});
  });

  // ==========================================
  // LIST THEMES TESTS
  // ==========================================

  describe('GET /api/themes', () => {

    test('Should list all available themes', async () => {
      const response = await request(app)
        .get('/api/themes');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    test('Should return theme details', async () => {
      const response = await request(app)
        .get('/api/themes');

      expect(response.status).toBe(200);
      const themes = response.body.data;
      
      // Each theme should have a name
      themes.forEach(theme => {
        expect(theme.name).toBeDefined();
      });
    });

    test('Should include default themes', async () => {
      const response = await request(app)
        .get('/api/themes');

      const themeNames = response.body.data.map(t => t.name);
      
      // Check for some common themes
      expect(themeNames).toContain('Dark');
      expect(themeNames).toContain('Light');
    });

  });

  // ==========================================
  // GET USER THEME TESTS
  // ==========================================

  describe('GET /api/themes/user/:userId', () => {

    test('Should get user current theme', async () => {
      // Apply theme first
      await request(app)
        .post('/api/themes/apply')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: studentId,
          themeName: 'theme-ocean'
        });

      // Get theme
      const response = await request(app)
        .get(`/api/themes/user/${studentId}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.themeName).toBe('theme-ocean');
    });

    test('Should return default theme if none set', async () => {
      const response = await request(app)
        .get(`/api/themes/user/${studentId}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      // Should have default theme
      expect(response.body.data.themeName).toBeDefined();
    });

    test('Should require authentication', async () => {
      const response = await request(app)
        .get(`/api/themes/user/${studentId}`);

      expect(response.status).toBe(401);
    });

  });

  // ==========================================
  // APPLY THEME TESTS
  // ==========================================

  describe('POST /api/themes/apply', () => {

    test('Admin should apply theme to student', async () => {
      const response = await request(app)
        .post('/api/themes/apply')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: studentId,
          themeName: 'theme-dark'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify theme was applied
      const theme = await Theme.findOne({ userId: studentId });
      expect(theme.themeName).toBe('theme-dark');
    });

    test('Assistant should apply theme', async () => {
      const response = await request(app)
        .post('/api/themes/apply')
        .set('Authorization', `Bearer ${assistantToken}`)
        .send({
          userId: studentId,
          themeName: 'theme-light'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('Student should apply theme to themselves', async () => {
      const response = await request(app)
        .post('/api/themes/apply')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          userId: studentId,
          themeName: 'theme-purple'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('Should reject invalid theme', async () => {
      const response = await request(app)
        .post('/api/themes/apply')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: studentId,
          themeName: 'invalid-theme-xyz'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('Should fail with missing userId', async () => {
      const response = await request(app)
        .post('/api/themes/apply')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          themeName: 'theme-dark'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('Should fail with missing themeName', async () => {
      const response = await request(app)
        .post('/api/themes/apply')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: studentId
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('Should require authentication', async () => {
      const response = await request(app)
        .post('/api/themes/apply')
        .send({
          userId: studentId,
          themeName: 'theme-dark'
        });

      expect(response.status).toBe(401);
    });

  });

  // ==========================================
  // RESET THEME TESTS
  // ==========================================

  describe('POST /api/themes/reset/:userId', () => {

    test('Should reset theme to default', async () => {
      // Apply a theme first
      await request(app)
        .post('/api/themes/apply')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: studentId,
          themeName: 'theme-ocean'
        });

      // Reset theme
      const response = await request(app)
        .post(`/api/themes/reset/${studentId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify it was reset to default
      const theme = await Theme.findOne({ userId: studentId });
      expect(theme.themeName).toBe('theme-dark'); // default
    });

    test('Admin should reset theme', async () => {
      const response = await request(app)
        .post(`/api/themes/reset/${studentId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
    });

    test('Should fail without authentication', async () => {
      const response = await request(app)
        .post(`/api/themes/reset/${studentId}`);

      expect(response.status).toBe(401);
    });

  });

  // ==========================================
  // THEME PERSISTENCE TESTS
  // ==========================================

  describe('Theme Persistence', () => {

    test('Applied theme should persist across sessions', async () => {
      // Apply theme
      await request(app)
        .post('/api/themes/apply')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: studentId,
          themeName: 'theme-sunset'
        });

      // Get theme multiple times
      const response1 = await request(app)
        .get(`/api/themes/user/${studentId}`)
        .set('Authorization', `Bearer ${studentToken}`);

      const response2 = await request(app)
        .get(`/api/themes/user/${studentId}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response1.body.data.themeName).toBe('theme-sunset');
      expect(response2.body.data.themeName).toBe('theme-sunset');
    });

  });

  // ==========================================
  // VALID THEME NAMES
  // ==========================================

  describe('Valid Themes', () => {

    const validThemes = [
      'theme-default',
      'theme-dark',
      'theme-light',
      'theme-ocean',
      'theme-sunset',
      'theme-purple',
      'theme-forest'
    ];

    validThemes.forEach(themeName => {
      test(`Should accept ${themeName}`, async () => {
        const response = await request(app)
          .post('/api/themes/apply')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            userId: studentId,
            themeName: themeName
          });

        expect(response.status).toBeOneOf([200, 201]);
      });
    });

  });

});
