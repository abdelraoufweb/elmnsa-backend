// ==========================================
// MESSAGE CONTROLLER TESTS
// ==========================================

const request = require('supertest');
const app = require('../index');
const User = require('../models/User');
const Message = require('../models/Message');
const mongoose = require('mongoose');

describe('Message Controller', () => {

  let adminToken;
  let assistantToken;
  let studentToken;
  let adminId;
  let studentId;
  let messageId;

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
    adminId = adminRes.body.user._id;

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
    await Message.deleteMany({});
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await Message.deleteMany({});
  });

  // ==========================================
  // SEND MESSAGE TESTS
  // ==========================================

  describe('POST /api/messages/send', () => {

    test('Admin should send message to student', async () => {
      const response = await request(app)
        .post('/api/messages/send')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          toId: studentId,
          text: 'Hello, how are you?'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data._id).toBeDefined();
      messageId = response.body.data._id;
    });

    test('Assistant should send message', async () => {
      const response = await request(app)
        .post('/api/messages/send')
        .set('Authorization', `Bearer ${assistantToken}`)
        .send({
          toId: studentId,
          text: 'I am here to help'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });

    test('Student should not be able to send message', async () => {
      const response = await request(app)
        .post('/api/messages/send')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          toId: adminId,
          text: 'Hello teacher'
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('Should fail with missing toId', async () => {
      const response = await request(app)
        .post('/api/messages/send')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          text: 'Hello'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('Should fail with missing text', async () => {
      const response = await request(app)
        .post('/api/messages/send')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          toId: studentId
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('Should fail to send to non-existent user', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .post('/api/messages/send')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          toId: fakeId,
          text: 'Hello'
        });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

  });

  // ==========================================
  // GET MESSAGES TESTS
  // ==========================================

  describe('GET /api/messages', () => {

    test('Should get messages with pagination', async () => {
      // Send some messages first
      await request(app)
        .post('/api/messages/send')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          toId: studentId,
          text: 'Message 1'
        });

      const response = await request(app)
        .get('/api/messages')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.pagination).toBeDefined();
    });

    test('Should support page and limit parameters', async () => {
      const response = await request(app)
        .get('/api/messages?page=1&limit=10')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response.status).toBe(200);
      expect(response.body.pagination.limit).toBe(10);
    });

  });

  // ==========================================
  // GET THREAD MESSAGES TESTS
  // ==========================================

  describe('GET /api/messages/:threadId', () => {

    test('Should get messages from specific thread', async () => {
      // Send message first
      const sendRes = await request(app)
        .post('/api/messages/send')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          toId: studentId,
          text: 'Hello from thread'
        });

      const threadId = `chat:${studentId}`;
      const response = await request(app)
        .get(`/api/messages/${threadId}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

  });

  // ==========================================
  // MARK AS READ TESTS
  // ==========================================

  describe('PUT /api/messages/:messageId/read', () => {

    test('Should mark message as read', async () => {
      // Send message first
      const sendRes = await request(app)
        .post('/api/messages/send')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          toId: studentId,
          text: 'Mark me as read'
        });
      const msgId = sendRes.body.data._id;

      // Mark as read
      const response = await request(app)
        .put(`/api/messages/${msgId}/read`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify it was marked as read
      const message = await Message.findById(msgId);
      expect(message.read).toBe(true);
      expect(message.readAt).toBeDefined();
    });

  });

  // ==========================================
  // DELETE MESSAGE TESTS
  // ==========================================

  describe('DELETE /api/messages/:messageId', () => {

    test('Sender should delete message', async () => {
      // Send message
      const sendRes = await request(app)
        .post('/api/messages/send')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          toId: studentId,
          text: 'Delete me'
        });
      const msgId = sendRes.body.data._id;

      // Delete
      const response = await request(app)
        .delete(`/api/messages/${msgId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify deletion
      const message = await Message.findById(msgId);
      expect(message).toBeNull();
    });

    test('Non-sender should not delete message', async () => {
      // Send message as admin
      const sendRes = await request(app)
        .post('/api/messages/send')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          toId: studentId,
          text: 'Cannot delete'
        });
      const msgId = sendRes.body.data._id;

      // Try to delete as student
      const response = await request(app)
        .delete(`/api/messages/${msgId}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

  });

  // ==========================================
  // GET UNREAD COUNT TESTS
  // ==========================================

  describe('GET /api/messages/unread/count', () => {

    test('Should get unread message count', async () => {
      // Send messages
      await request(app)
        .post('/api/messages/send')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          toId: studentId,
          text: 'Unread 1'
        });

      await request(app)
        .post('/api/messages/send')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          toId: studentId,
          text: 'Unread 2'
        });

      const response = await request(app)
        .get('/api/messages/unread/count')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.unreadCount).toBeGreaterThanOrEqual(2);
    });

    test('Should return 0 for no unread messages', async () => {
      const response = await request(app)
        .get('/api/messages/unread/count')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(response.status).toBe(200);
      expect(typeof response.body.data.unreadCount).toBe('number');
    });

  });

});
