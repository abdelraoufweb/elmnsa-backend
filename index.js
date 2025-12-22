// ==========================================
// MAIN SERVER FILE - EXPRESS + MONGODB
// ==========================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const helmet = require('helmet');
const path = require('path');
const rateLimit = require('express-rate-limit');

// Routes
const authRoutes = require('./routes/auth');
const accessRoutes = require('./routes/access');
const videoRoutes = require('./routes/videos');
const studentRoutes = require('./routes/students');
const messageRoutes = require('./routes/messages');
const themeRoutes = require('./routes/themes');
const adminRoutes = require('./routes/admin');
const deviceRoutes = require('./routes/devices');

// Middleware
const { authMiddleware } = require('./middleware/auth');
const { validateDeviceAccess } = require('./middleware/deviceValidator');

// ==========================================
// ENVIRONMENT VALIDATION
// ==========================================

const requiredEnvVars = [
  'JWT_SECRET',
  'MONGODB_URI',
  'NODE_ENV'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ FATAL: Missing required environment variables:');
  missingVars.forEach(varName => {
    console.error(`   - ${varName}`);
  });
  console.error('\nPlease set these in your .env file before starting the server.');
  process.exit(1);
}

// Validate JWT_SECRET length (minimum 32 characters for HS256)
if (process.env.JWT_SECRET.length < 32) {
  console.error('❌ FATAL: JWT_SECRET must be at least 32 characters long');
  process.exit(1);
}

// Validate NODE_ENV is one of allowed values
const validNodeEnv = ['development', 'production', 'testing'];
if (!validNodeEnv.includes(process.env.NODE_ENV)) {
  console.error(`❌ FATAL: NODE_ENV must be one of: ${validNodeEnv.join(', ')}`);
  process.exit(1);
}

// Validate CORS is configured for production
if (process.env.NODE_ENV === 'production' && !process.env.CORS_ORIGIN) {
  console.error('❌ FATAL: CORS_ORIGIN must be set in production');
  process.exit(1);
}

console.log('✅ All required environment variables are set');

// ==========================================
// INITIALIZE EXPRESS APP
// ==========================================

const app = express();
const PORT = process.env.PORT || 5000;

// ==========================================
// SECURITY & CORS MIDDLEWARE
// ==========================================

app.use(helmet());

// Rate limiters
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max: 5,  // 5 attempts per windowMs
  message: 'Too many login attempts, please try again later',
  standardHeaders: true,
  skipSuccessfulRequests: false
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true
});

// CORS Configuration - Allow remote frontends
const corsOptions = {
  origin: process.env.CORS_ORIGIN || undefined,
  credentials: true,
  optionsSuccessStatus: 200
};

if (!process.env.CORS_ORIGIN && process.env.NODE_ENV === 'development') {
  console.warn('⚠️  WARNING: CORS_ORIGIN not set. Using unrestricted CORS (development only)');
  corsOptions.origin = '*';
}

app.use(cors(corsOptions));

// Apply rate limiters
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/verify-access-code', authLimiter);
app.use(generalLimiter);

// ==========================================
// BODY PARSER MIDDLEWARE
// ==========================================

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ==========================================
// STATIC FILES
// ==========================================

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ==========================================
// API ROUTES
// ==========================================

// Access code verification (public - no authentication required)
app.use('/api/access', accessRoutes);

// Auth routes (public)
app.use('/api/auth', authRoutes);

// Protected routes (require authentication)
app.use('/api/videos', authMiddleware, validateDeviceAccess, videoRoutes);
app.use('/api/students', authMiddleware, studentRoutes);
app.use('/api/messages', authMiddleware, validateDeviceAccess, messageRoutes);
app.use('/api/themes', authMiddleware, themeRoutes);
app.use('/api/admin', authMiddleware, adminRoutes);
app.use('/api/devices', deviceRoutes);  // authMiddleware is inside each route

// Health check
app.get('/api/health', (req, res) => {
  const isConnected = process.env.DEMO_MODE !== 'true';
  res.status(200).json({
    success: true,
    message: isConnected ? 'Server running with database' : 'Server running (limited mode)',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: isConnected ? 'connected' : 'unavailable',
    mode: isConnected ? 'production' : 'limited',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Health check endpoint for Docker health checks (no /api prefix)
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// ==========================================
// 404 HANDLER
// ==========================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    path: req.path
  });
});

// ==========================================
// ERROR HANDLER
// ==========================================

app.use((err, req, res, next) => {
  console.error('[ERROR]', {
    status: err.status || 500,
    message: err.message,
    timestamp: new Date().toISOString(),
    path: req.path
  });
  
  // Never expose error details in production
  const errorResponse = {
    success: false,
    message: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { error: err.message })
  };

  res.status(err.status || 500).json(errorResponse);
});

// ==========================================
// DATABASE CONNECTION & SERVER START
// ==========================================

const connectDatabase = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/elmnsa_db';
    
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10,
      minPoolSize: 5,
      retryWrites: true,
      w: 'majority',
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000
    });

    console.log('✅ MongoDB connected successfully');
    console.log(`📊 Database: ${mongoURI.split('/').pop().split('?')[0]}`);
    return true;
  } catch (error) {
    console.error('❌ MongoDB connection FAILED:', error.message);
    console.error('\n⚠️  PRODUCTION MODE REQUIRES VALID DATABASE CONNECTION!');
    console.error('\n📋 Fix MongoDB Connection:');
    console.error('   1. Go to: https://cloud.mongodb.com');
    console.error('   2. Cluster: abdelraouf');
    console.error('   3. Network Access: Add your IP (0.0.0.0/0 for development)');
    console.error('   4. Verify MONGODB_URI in .env');
    console.error('   5. Restart backend\n');
    
    // In production, FAIL - don't allow demo mode
    if (process.env.NODE_ENV === 'production') {
      console.error('❌ FATAL: Production requires valid MongoDB connection');
      process.exit(1);
    }
    
    // In development, give warning but allow to continue
    if (process.env.NODE_ENV === 'development') {
      console.warn('⚠️  WARNING: Running in LIMITED mode (some features disabled)');
      console.warn('ℹ️  Add MongoDB IP whitelist to enable full functionality\n');
    }
    
    return false;
  }
};

const startServer = async () => {
  try {
    // Connect to database
    await connectDatabase();

    // Start server
    app.listen(PORT, () => {
      console.log(`
╔════════════════════════════════════════════════════════╗
║                  🚀 ELMNSA BACKEND                     ║
╠════════════════════════════════════════════════════════╣
║ ✅ Server Running on Port: ${PORT}
║ ✅ Environment: ${process.env.NODE_ENV || 'development'}
║ ✅ Database: Connected
║ ✅ CORS: ${process.env.CORS_ORIGIN || 'http://localhost:8000'}
║ ✅ API Health: http://localhost:${PORT}/api/health
╚════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Rejection:', err);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

// Start the server
startServer();

module.exports = app;
