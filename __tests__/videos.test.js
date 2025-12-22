// ==========================================
// VIDEO CONTROLLER TESTS
// ==========================================

const request = require('supertest');
const app = require('../index');
const User = require('../models/User');
const Video = require('../models/Video');
const AccessCode = require('../models/AccessCode');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

describe('Video Controller', () => {

  let adminToken;
  let studentToken;
  let studentId;
  let videoId;

  // ==========================================
  // SETUP & TEARDOWN
  // ==========================================

  beforeAll(async () => {
    const testDbUri = process.env.TEST_MONGODB_URI || 'mongodb://localhost:27017/elmnsa_test';
    await mongoose.connect(testDbUri);

    // Create admin user
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

    // Create student user
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
    await Video.deleteMany({});
    await AccessCode.deleteMany({});
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await Video.deleteMany({});
    await AccessCode.deleteMany({});
  });

  // ==========================================
  // LIST VIDEOS TESTS
  // ==========================================

  describe('GET /api/videos', () => {

    test('Should list all videos (public endpoint)', async () => {
      // Create a video first
      await Video.create({
        title: 'Test Video',
        description: 'Test Description',
        youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        youtubeId: 'dQw4w9WgXcQ',
        grade: 'Grade 3',
        curriculum: 'Egyptian',
        status: 'published',
        createdBy: studentId
      });

      const response = await request(app)
        .get('/api/videos');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    test('Should support pagination', async () => {
      // Create multiple videos
      for (let i = 0; i < 5; i++) {
        await Video.create({
          title: `Test Video ${i}`,
          description: 'Test Description',
          youtubeUrl: `https://www.youtube.com/watch?v=vid${i}`,
          youtubeId: `vid${i}`,
          grade: 'Grade 3',
          curriculum: 'Egyptian',
          status: 'published',
          createdBy: studentId
        });
      }

      const response = await request(app)
        .get('/api/videos?page=1&limit=2');

      expect(response.status).toBe(200);
      expect(response.body.data.length).toBeLessThanOrEqual(2);
    });

  });

  // ==========================================
  // GET SINGLE VIDEO TESTS
  // ==========================================

  describe('GET /api/videos/:videoId', () => {

    test('Should get video details by ID', async () => {
      const video = await Video.create({
        title: 'Test Video',
        description: 'Test Description',
        youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        youtubeId: 'dQw4w9WgXcQ',
        grade: 'Grade 3',
        curriculum: 'Egyptian',
        status: 'published',
        createdBy: studentId
      });

      const response = await request(app)
        .get(`/api/videos/${video._id}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.title).toBe('Test Video');
    });

    test('Should return 404 for non-existent video', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app)
        .get(`/api/videos/${fakeId}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });

  });

  // ==========================================
  // CREATE VIDEO TESTS
  // ==========================================

  describe('POST /api/videos', () => {

    test('Should create video with YouTube URL', async () => {
      const response = await request(app)
        .post('/api/videos')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'New Test Video',
          description: 'Test Description',
          youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          grade: 'Grade 3',
          curriculum: 'Egyptian'
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data._id).toBeDefined();
      videoId = response.body.data._id;
    });

    test('Should fail without media source', async () => {
      const response = await request(app)
        .post('/api/videos')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Video without media',
          description: 'Test Description',
          grade: 'Grade 3',
          curriculum: 'Egyptian'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test('Student should not be able to create video', async () => {
      const response = await request(app)
        .post('/api/videos')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          title: 'Unauthorized Video',
          description: 'Test',
          youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          grade: 'Grade 3',
          curriculum: 'Egyptian'
        });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    test('Should fail without authentication', async () => {
      const response = await request(app)
        .post('/api/videos')
        .send({
          title: 'Test Video',
          description: 'Test',
          youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          grade: 'Grade 3',
          curriculum: 'Egyptian'
        });

      expect(response.status).toBe(401);
    });

  });

  // ==========================================
  // UPDATE VIDEO TESTS
  // ==========================================

  describe('PUT /api/videos/:videoId', () => {

    test('Should update video', async () => {
      const video = await Video.create({
        title: 'Original Title',
        description: 'Original Description',
        youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        youtubeId: 'dQw4w9WgXcQ',
        grade: 'Grade 3',
        curriculum: 'Egyptian',
        status: 'published',
        createdBy: adminToken
      });

      const response = await request(app)
        .put(`/api/videos/${video._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Updated Title'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

  });

  // ==========================================
  // DELETE VIDEO TESTS
  // ==========================================

  describe('DELETE /api/videos/:videoId', () => {

    test('Should delete video', async () => {
      const video = await Video.create({
        title: 'Video to Delete',
        description: 'Test',
        youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        youtubeId: 'dQw4w9WgXcQ',
        grade: 'Grade 3',
        curriculum: 'Egyptian',
        status: 'published',
        createdBy: adminToken
      });

      const response = await request(app)
        .delete(`/api/videos/${video._id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

  });

});
