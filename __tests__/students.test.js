// ==========================================
// STUDENT CONTROLLER TESTS
// ==========================================

const request = require('supertest');
const app = require('../index');
const User = require('../models/User');
const Theme = require('../models/Theme');
const mongoose = require('mongoose');

describe('Student Controller', () => {

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
    // Reset collections
    await Theme.deleteMany({});
  });

  // ==========================================
  // LIST STUDENTS TESTS
  // ==========================================

  describe('GET /api/students', () => {

    test('Should list students with admin role', async () => {
      const response = await request(app)
        .get('/api/students')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    test('Should list students with assistant role', async () => {
      const response = await request(app)
        .get('/api/students')
        .set('Authorization', `Bearer ${assistantToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('Student should not be able to list students', async () => {
      const response = await request(app)
        .get('/api/students')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('Should support pagination', async () => {
      const response = await request(app)
        .get('/api/students?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.pagination).toBeDefined();
    });

    test('Should filter by status', async () => {
      const response = await request(app)
        .get('/api/students?status=pending')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
    });

  });

  // ==========================================
  // GET SINGLE STUDENT TESTS
  // ==========================================

  describe('GET /api/students/:studentId', () => {

    test('Should get student details', async () => {
      const response = await request(app)
        .get(`/api/students/${studentId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.firstName).toBe('Ahmed');
    });

    test('Student should get their own details', async () => {
      const response = await request(app)
        .get(`/api/students/${studentId}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.firstName).toBe('Ahmed');
    });

    test('Should return 404 for non-existent student', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/students/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(404);
    });

  });

  // ==========================================
  // UPDATE STUDENT TESTS
  // ==========================================

  describe('PUT /api/students/:studentId', () => {

    test('Admin should update student info', async () => {
      const response = await request(app)
        .put(`/api/students/${studentId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          firstName: 'Mohammed',
          grade: 'Grade 4'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('Student should not be able to update other students', async () => {
      // Create another student
      const newStudentRes = await request(app)
        .post('/api/auth/register')
        .send({
          firstName: 'Ali',
          lastName: 'Ahmed',
          parentPhone: '01004444444',
          password: 'Pass123',
          grade: 'Grade 3',
          curriculum: 'Egyptian',
          role: 'student'
        });
      const newStudentId = newStudentRes.body.user._id;

      const response = await request(app)
        .put(`/api/students/${newStudentId}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          firstName: 'Hacked'
        });

      expect(response.status).toBe(403);
    });

  });

  // ==========================================
  // APPROVE STUDENT TESTS
  // ==========================================

  describe('POST /api/students/:studentId/approve', () => {

    test('Admin should approve student account', async () => {
      const response = await request(app)
        .post(`/api/students/${studentId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify status was updated
      const updatedStudent = await User.findById(studentId);
      expect(updatedStudent.status).toBe('approved');
    });

    test('Student should not be able to approve accounts', async () => {
      const response = await request(app)
        .post(`/api/students/${studentId}/approve`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response.status).toBe(403);
    });

  });

  // ==========================================
  // BLOCK STUDENT TESTS
  // ==========================================

  describe('POST /api/students/:studentId/block', () => {

    test('Admin should block student account', async () => {
      const response = await request(app)
        .post(`/api/students/${studentId}/block`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          reason: 'Violated terms of service'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify status was updated
      const updatedStudent = await User.findById(studentId);
      expect(updatedStudent.status).toBe('blocked');
    });

  });

  // ==========================================
  // DELETE STUDENT TESTS
  // ==========================================

  describe('DELETE /api/students/:studentId', () => {

    test('Admin should delete student account', async () => {
      // Create a student to delete
      const studentToDeleteRes = await request(app)
        .post('/api/auth/register')
        .send({
          firstName: 'ToDelete',
          lastName: 'Student',
          parentPhone: '01005555555',
          password: 'Pass123',
          grade: 'Grade 3',
          curriculum: 'Egyptian',
          role: 'student'
        });
      const studentToDeleteId = studentToDeleteRes.body.user._id;

      const response = await request(app)
        .delete(`/api/students/${studentToDeleteId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify deletion
      const deletedStudent = await User.findById(studentToDeleteId);
      expect(deletedStudent).toBeNull();
    });

  });

  // ==========================================
  // APPLY THEME TESTS
  // ==========================================

  describe('POST /api/students/:studentId/apply-theme', () => {

    test('Admin should apply theme to student', async () => {
      const response = await request(app)
        .post(`/api/students/${studentId}/apply-theme`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          themeName: 'theme-dark'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test('Should reject invalid theme', async () => {
      const response = await request(app)
        .post(`/api/students/${studentId}/apply-theme`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          themeName: 'invalid-theme'
        });

      expect(response.status).toBe(400);
    });

  });

  // ==========================================
  // GET STUDENT THEME TESTS
  // ==========================================

  describe('GET /api/students/:studentId/theme', () => {

    test('Should get student theme', async () => {
      // Apply theme first
      await request(app)
        .post(`/api/students/${studentId}/apply-theme`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          themeName: 'theme-ocean'
        });

      // Get theme
      const response = await request(app)
        .get(`/api/students/${studentId}/theme`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.themeName).toBe('theme-ocean');
    });

    test('Should return default theme if none set', async () => {
      const response = await request(app)
        .get(`/api/students/${studentId}/theme`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.data.themeName).toBeDefined();
    });

  });

});
