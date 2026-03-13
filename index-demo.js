// ==========================================
// DEMO SERVER - WITHOUT DATABASE
// ==========================================

require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Demo Access Codes Database (في الذاكرة)
const DEMO_ACCESS_CODES = {
  'student': { type: 'student', role: 'student', redirectTo: '/register' },
  'ahmmed/assem/@24681012': { type: 'admin', role: 'admin', redirectTo: '/admin' },
  'rashwan20081907': { type: 'developer', role: 'developer', redirectTo: '/developer' },
  'Saif22@55': { type: 'assistant', role: 'assistant', redirectTo: '/assistant' },
  'haidy261104': { type: 'assistant', role: 'assistant', redirectTo: '/assistant' },
  'parent123': { type: 'parent', role: 'parent', redirectTo: '/parent-dashboard' },
  'video123': { type: 'video', role: 'student', redirectTo: '/dashboard' },
};

// Health Check
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '✅ Backend Server Running (DEMO MODE - No Database)',
    environment: NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

// Verify Access Code - MAIN ENDPOINT
app.post('/api/auth/verify-access-code', (req, res) => {
  try {
    const { code } = req.body;

    console.log(`📥 Access Code Request: "${code}"`);
    console.log(`📥 Request headers:`, req.headers);

    if (!code) {
      return res.status(400).json({
        success: false,
        message: 'Code is required'
      });
    }

    // Check if code exists in demo database
    const accessCode = DEMO_ACCESS_CODES[code];

    if (!accessCode) {
      console.log(`❌ Invalid code: "${code}"`);
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired access code'
      });
    }

    console.log(`✅ Code verified: ${code} (${accessCode.type})`);

    // Generate token
    const token = `token_${Math.random().toString(36).substring(7)}`;
    
    res.status(200).json({
      success: true,
      message: 'Access code verified',
      data: {
        token: token,
        redirectTo: accessCode.redirectTo,
        role: accessCode.role,
        valid: true,
        accessType: accessCode.type
      }
    });
  } catch (error) {
    console.error('❌ Error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Debug route - test connection
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'API is working',
    timestamp: new Date().toISOString()
  });
});

// API Routes - Students
app.get('/api/students/videos', (req, res) => {
  console.log(`📤 GET /api/students/videos`);
  res.json({
    success: true,
    data: [
      { id: 1, title: 'Video 1', duration: 30 },
      { id: 2, title: 'Video 2', duration: 45 }
    ]
  });
});

app.get('/api/students/worksheets', (req, res) => {
  console.log(`📤 GET /api/students/worksheets`);
  res.json({
    success: true,
    data: [
      { id: 1, title: 'Worksheet 1', subject: 'Math' },
      { id: 2, title: 'Worksheet 2', subject: 'English' }
    ]
  });
});

app.get('/api/students/profile', (req, res) => {
  console.log(`📤 GET /api/students/profile`);
  res.json({
    success: true,
    data: { name: 'Student', email: 'student@example.com', phone: '+20123456789' }
  });
});

app.get('/api/students/homework', (req, res) => {
  console.log(`📤 GET /api/students/homework`);
  res.json({
    success: true,
    data: []
  });
});

app.post('/api/students/homework', (req, res) => {
  console.log(`📤 POST /api/students/homework`);
  res.json({
    success: true,
    message: 'Homework submitted'
  });
});

app.get('/api/students/messages', (req, res) => {
  console.log(`📤 GET /api/students/messages`);
  res.json({
    success: true,
    data: []
  });
});

// API Routes - Store
app.get('/api/store/products', (req, res) => {
  console.log(`📤 GET /api/store/products`);
  res.json({
    success: true,
    data: []
  });
});

// API Routes - Admin
app.get('/api/admin/pending-accounts', (req, res) => {
  console.log(`📤 GET /api/admin/pending-accounts`);
  res.json({
    success: true,
    data: []
  });
});

// 404 Handler
app.use((req, res) => {
  console.log(`⚠️ [404] ${req.method} ${req.path}`);
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.path}`
  });
});

// Socket.io Events
io.on('connection', (socket) => {
  console.log(`✅ Socket connected: ${socket.id}`);

  socket.on('authenticate', (data) => {
    console.log(`🔐 Socket authenticated:`, data);
    socket.emit('authenticated', { success: true });
  });

  socket.on('echo', (data) => {
    socket.emit('echo', data);
  });

  socket.on('disconnect', () => {
    console.log(`❌ Socket disconnected: ${socket.id}`);
  });
});

// Start Server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n╔════════════════════════════════════════════════════════╗`);
  console.log(`║         🚀 BACKEND SERVER (DEMO MODE - NO DB)           ║`);
  console.log(`╠════════════════════════════════════════════════════════╣`);
  console.log(`║ ✅ Server running on: http://0.0.0.0:${PORT}`);
  console.log(`║ ✅ API Base URL: http://127.0.0.1:${PORT}/api`);
  console.log(`║ ✅ Environment: ${NODE_ENV}`);
  console.log(`║ ✅ Socket.io: Enabled`);
  console.log(`║ ✅ CORS: Enabled (all origins)`);
  console.log(`║`);
  console.log(`║ 🔐 Test Access Codes:`);
  console.log(`║    - student`);
  console.log(`║    - admin`);
  console.log(`║    - developer`);
  console.log(`║    - parent123`);
  console.log(`║    - Saif22@55`);
  console.log(`║`);
  console.log(`║ 🌐 Frontend: http://localhost:8000`);
  console.log(`╚════════════════════════════════════════════════════════╝\n`);
});

process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully');
  server.close();
});
