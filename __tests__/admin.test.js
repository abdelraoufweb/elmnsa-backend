// ==========================================
// ADMIN CONTROLLER TESTS
// ==========================================

const request = require('supertest');
const app = require('../index');
const User = require('../models/User');
const SecurityLog = require('../models/SecurityLog');
const mongoose = require('mongoose');

describe('Admin Controller', () => {

  let adminToken;
  let developerToken;
  let teacherToken;
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

    // Create developer
    const devRes = await request(app)
      .post('/api/auth/register')
      .send({
        firstName: 'Developer',
        lastName: 'User',
        parentPhone: '01004444444',
        password: 'DevPass123',
        grade: 'N/A',
        curriculum: 'N/A',
        role: 'developer'
      });
    developerToken = devRes.body.token;

    // Create teacher (should not have access)
    const teacherRes = await request(app)
      .post('/api/auth/register')
      .send({
        firstName: 'Teacher',
        lastName: 'User',
        parentPhone: '01006666666',
        password: 'TeacherPass123',
        grade: 'N/A',
        curriculum: 'N/A',
        role: 'teacher'
      });
    teacherToken = teacherRes.body.token;

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
    await SecurityLog.deleteMany({});
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await SecurityLog.deleteMany({});
  });

  // ==========================================
  // DASHBOARD TESTS
  // ==========================================

  describe('GET /api/admin/dashboard', () => {

    test('Admin should access dashboard', async () => {
      const response = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.students).toBeDefined();
      expect(response.body.data.videos).toBeDefined();
      expect(response.body.data.messages).toBeDefined();
    });

    test('Developer should access dashboard', async () => {
      const response = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${developerToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('Teacher should not access dashboard', async () => {
      const response = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('Should return correct statistics', async () => {
      const response = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.body.data.students.total).toBeGreaterThanOrEqual(1);
      expect(response.body.data.videos.total).toBeGreaterThanOrEqual(0);
    });

  });

  // ==========================================
  // SECURITY LOGS TESTS
  // ==========================================

  describe('GET /api/admin/logs', () => {

    test('Admin should view logs', async () => {
      const response = await request(app)
        .get('/api/admin/logs')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.pagination).toBeDefined();
    });

    test('Should support filtering by type', async () => {
      const response = await request(app)
        .get('/api/admin/logs?type=login')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
    });

    test('Should support pagination', async () => {
      const response = await request(app)
        .get('/api/admin/logs?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.pagination.limit).toBe(10);
      expect(response.body.pagination.page).toBe(1);
    });

    test('Should filter by days', async () => {
      const response = await request(app)
        .get('/api/admin/logs?days=7')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
    });

    test('Should deny access to non-admins', async () => {
      const response = await request(app)
        .get('/api/admin/logs')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response.status).toBe(403);
    });

  });

  // ==========================================
  // PENDING ACCOUNTS TESTS
  // ==========================================

  describe('GET /api/admin/pending-accounts', () => {

    test('Admin should view pending accounts', async () => {
      const response = await request(app)
        .get('/api/admin/pending-accounts')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.count).toBeDefined();
    });

    test('Should include pending students', async () => {
      const response = await request(app)
        .get('/api/admin/pending-accounts')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.body.data.length).toBeGreaterThan(0);
    });

  });

  // ==========================================
  // APPROVE ACCOUNT TESTS
  // ==========================================

  describe('POST /api/admin/approve-account', () => {

    test('Admin should approve account', async () => {
      // Create a pending student
      const newStudentRes = await request(app)
        .post('/api/auth/register')
        .send({
          firstName: 'Ali',
          lastName: 'Pending',
          parentPhone: '01005555555',
          password: 'Pass123',
          grade: 'Grade 3',
          curriculum: 'Egyptian',
          role: 'student'
        });
      const newStudentId = newStudentRes.body.user._id;

      // Approve
      const response = await request(app)
        .post('/api/admin/approve-account')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: newStudentId
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify status
      const user = await User.findById(newStudentId);
      expect(user.status).toBe('approved');
    });

    test('Should fail with missing userId', async () => {
      const response = await request(app)
        .post('/api/admin/approve-account')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('Should fail for non-existent user', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .post('/api/admin/approve-account')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: fakeId
        });

      expect(response.status).toBe(404);
    });

  });

  // ==========================================
  // BLOCK USER TESTS
  // ==========================================

  describe('POST /api/admin/block-user', () => {

    test('Admin should block user', async () => {
      const response = await request(app)
        .post('/api/admin/block-user')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: studentId,
          reason: 'Violating terms'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify status
      const user = await User.findById(studentId);
      expect(user.status).toBe('blocked');
    });

    test('Should block without reason', async () => {
      // Create another student
      const newStudentRes = await request(app)
        .post('/api/auth/register')
        .send({
          firstName: 'Test',
          lastName: 'Block',
          parentPhone: '01008888888',
          password: 'Pass123',
          grade: 'Grade 3',
          curriculum: 'Egyptian',
          role: 'student'
        });
      const newStudentId = newStudentRes.body.user._id;

      const response = await request(app)
        .post('/api/admin/block-user')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: newStudentId
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('Developer should block user', async () => {
      const newStudentRes = await request(app)
        .post('/api/auth/register')
        .send({
          firstName: 'Dev',
          lastName: 'Block',
          parentPhone: '01009999999',
          password: 'Pass123',
          grade: 'Grade 3',
          curriculum: 'Egyptian',
          role: 'student'
        });
      const newStudentId = newStudentRes.body.user._id;

      const response = await request(app)
        .post('/api/admin/block-user')
        .set('Authorization', `Bearer ${developerToken}`)
        .send({
          userId: newStudentId,
          reason: 'Test block'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

  });

  // ==========================================
  // UNBLOCK USER TESTS
  // ==========================================

  describe('POST /api/admin/unblock-user', () => {

    test('Admin should unblock user', async () => {
      // Create and block a student
      const newStudentRes = await request(app)
        .post('/api/auth/register')
        .send({
          firstName: 'Unblock',
          lastName: 'Test',
          parentPhone: '01007777777',
          password: 'Pass123',
          grade: 'Grade 3',
          curriculum: 'Egyptian',
          role: 'student'
        });
      const newStudentId = newStudentRes.body.user._id;

      // Block
      await request(app)
        .post('/api/admin/block-user')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: newStudentId,
          reason: 'Test'
        });

      // Unblock
      const response = await request(app)
        .post('/api/admin/unblock-user')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: newStudentId
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify status
      const user = await User.findById(newStudentId);
      expect(user.status).toBe('approved');
    });

  });

});
