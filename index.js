// ==========================================
// PRODUCTION-READY SERVER - RAILWAY COMPATIBLE
// ==========================================

require('dotenv').config();

const http = require('http');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

// Disable buffering globally BEFORE any models are required to prevent hanging queries on disconnect
mongoose.set('bufferCommands', false);

mongoose.connection.on('disconnected', () => console.log('⚠️ MongoDB disconnected!'));
mongoose.connection.on('reconnected', () => console.log('🔄 MongoDB reconnected!'));
mongoose.connection.on('error', (err) => console.error('❌ MongoDB error:', err));

const { Server } = require('socket.io');
const rateLimit = require('express-rate-limit');

// ==========================================
// PORT CONFIGURATION (RAILWAY COMPATIBLE)
// ==========================================

const PORT = process.env.PORT || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ==========================================
// ENVIRONMENT VALIDATION
// ==========================================

const requiredEnvVars = [
  'JWT_SECRET',
  'MONGODB_URI'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ FATAL: Missing required environment variables:');
  missingVars.forEach(varName => {
    console.error(`   - ${varName}`);
  });
  console.error('\nPlease set these in Railway Dashboard.');
  process.exit(1);
}

// Validate JWT_SECRET length
if (process.env.JWT_SECRET.length < 32) {
  console.error('❌ FATAL: JWT_SECRET must be at least 32 characters long');
  process.exit(1);
}

console.log('✅ Environment variables validated');

// ==========================================
// INITIALIZE EXPRESS APP
// ==========================================

const app = express();
app.set('trust proxy', 1); // Trust first proxy (Railway load balancer)

// ==========================================
// HTTP SERVER (RAILWAY COMPATIBLE)
// ==========================================

const server = http.createServer(app);

// ==========================================
// SOCKET.IO CONFIGURATION
// ==========================================

// Reuse the same origins configuration used by Express CORS
const defaultOrigins = [
  'https://elraouf.netlify.app',
  'https://airy-miracle-production.up.railway.app',
  'https://elmnsa-backend-production.up.railway.app',
  'http://localhost:8000',
  'http://localhost:5000',
  'http://localhost:3000'
];

const allowedOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',') 
  : defaultOrigins;

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  pingInterval: 30000,
  pingTimeout: 60000,
  maxHttpBufferSize: 1e6
});

// ==========================================
// CORS MIDDLEWARE
// ==========================================

const corsOptions = {
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

// ==========================================
// SECURITY MIDDLEWARE
// ==========================================

const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss');
const hpp = require('hpp');

// Set security headers with Helmet
app.use(helmet());

// Data sanitization against NoSQL query injection
app.use(mongoSanitize());

// Data sanitization against XSS using the 'xss' library
const filterXSS = xss;
app.use((req, res, next) => {
  try {
    const sanitizeObject = (obj) => {
      if (!obj || typeof obj !== 'object') return obj;
      for (const k of Object.keys(obj)) {
        if (typeof obj[k] === 'string') {
          obj[k] = filterXSS(obj[k]);
        } else if (typeof obj[k] === 'object') {
          sanitizeObject(obj[k]);
        }
      }
    };

    sanitizeObject(req.body);
    sanitizeObject(req.query);
    sanitizeObject(req.params);
  } catch (e) {
    // If sanitization fails, continue without blocking request
    console.error('XSS sanitization error:', e);
  }
  next();
});

// Prevent HTTP Parameter Pollution
app.use(hpp());

// ==========================================
// RATE LIMITING MIDDLEWARE
// ==========================================

// Helper to get a unique key for each client (User or IP)
const getClientKey = (req) => {
  // 1. Try to use User ID from Authorization header (if present)
  // This ensures authenticated users are tracked individually even if they share an IP
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader; // Use token as a unique key for the session
  }

  // 2. Fallback to IP address, with explicit handling for Railway's proxy
  // Note: app.set('trust proxy', 1) is already set above, but this adds extra safety
  return req.headers['x-forwarded-for'] || req.ip || 'global_fallback';
};

// General API limiter
const limiter = rateLimit({
  windowMs: (parseInt(process.env.RATE_LIMIT_WINDOW) || 15) * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000, // Increased from 500 to 1000 for better UX
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getClientKey, // Use our custom key generator
  message: { success: false, message: 'Too many requests from this user, please try again later.' },
  skip: (req) => req.method === 'OPTIONS', // Don't limit pre-flight requests
});

// Stricter limiter for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Increased from 20 to 30 to allow for some accidental retries
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.headers['x-forwarded-for'] || req.ip, // Auth routes usually don't have tokens yet
  message: { success: false, message: 'Too many login attempts from this IP, please try again after 15 minutes.' }
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/verify-access-code', authLimiter); // Stricter limit for codes
app.use('/api/', limiter);

// ==========================================
// EXPRESS MIDDLEWARE
// ==========================================

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Serve static files from uploads directory
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  req.io = io; // Attach socket.io to request for controllers
  next();
});

// ==========================================
// HEALTH CHECK ROUTE
// ==========================================

app.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    env: NODE_ENV,
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// ==========================================
// SOCKET.IO EVENT HANDLERS
// ==========================================

const { setupSocketHandlers } = require('./services/socketManager');
setupSocketHandlers(io);

// ==========================================
// API ROUTES - IMPORT ROUTE MODULES
// ==========================================

const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/students');
const storeRoutes = require('./routes/store');
const videosRoutes = require('./routes/videos');
const messagesRoutes = require('./routes/messages');
const themesRoutes = require('./routes/themes');
const devicesRoutes = require('./routes/devices');
const adminRoutes = require('./routes/admin');
const aiRoutes = require('./routes/ai');
const accessRoutes = require('./routes/access');
const groupRoutes = require('./routes/groups');
const announcementRoutes = require('./routes/announcement');
const scheduleRoutes = require('./routes/schedule');
const notificationRoutes = require('./routes/notifications');


// ==========================================
// MOUNT API ROUTES
// ==========================================

app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/store', storeRoutes);
app.use('/api/videos', videosRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/themes', themesRoutes);
app.use('/api/devices', devicesRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/access', accessRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/notifications', notificationRoutes);

app.use('/api/profile-requests', require('./routes/profileRequests'));
app.use('/api/live-sessions', require('./routes/live-sessions'));

// ==========================================
// BACKGROUND SERVICES
// ==========================================
const { startCleanupService } = require('./services/cleanupService');
startCleanupService();


// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Backend is healthy',
    env: NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

// ==========================================
// 404 HANDLER
// ==========================================

app.use((req, res) => {
  console.log(`⚠️  404 Not Found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    error: 'Not Found',
    path: req.path
  });
});

// ==========================================
// MONGODB CONNECTION
// ==========================================

const connectDatabase = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI;

    console.log('🔄 Connecting to MongoDB...');

    await mongoose.connect(mongoURI, {
      maxPoolSize: 50,
      serverSelectionTimeoutMS: 5000, // Reduced from 10000 to fail faster
      socketTimeoutMS: 45000,
    });

    console.log('✅ MongoDB connected successfully');

    // Seed access codes if database is empty
    try {
      const AccessCode = require('./models/AccessCode');
      const count = await AccessCode.countDocuments();

      if (count === 0) {
        console.log('📊 Access codes not found. Checking environment for seed values...');

        if (process.env.SEED_ACCESS_CODES) {
          try {
            const codes = JSON.parse(process.env.SEED_ACCESS_CODES);
            if (Array.isArray(codes) && codes.length > 0) {
              await AccessCode.insertMany(codes);
              console.log(`✅ Seeded ${codes.length} access codes from SEED_ACCESS_CODES`);
            } else {
              console.warn('⚠️ SEED_ACCESS_CODES is present but not an array or is empty. Skipping seeding.');
            }
          } catch (e) {
            console.error('❌ Failed to parse SEED_ACCESS_CODES. Skipping seeding.', e.message);
          }
        } else {
          console.warn('⚠️ No SEED_ACCESS_CODES provided. Skipping seeding to avoid committing secrets.');
        }
      }
    } catch (seedError) {
      console.warn('⚠️  Could not seed access codes:', seedError.message);
    }

    return true;
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    console.error('⚠️  Application will continue without database');
    return false;
  }
};

// ==========================================
// GRACEFUL SHUTDOWN
// ==========================================

const gracefulShutdown = async (signal) => {
  console.log(`\n⚠️  Received ${signal}, shutting down gracefully...`);

  server.close(async () => {
    console.log('🛑 Server closed');

    try {
      await mongoose.disconnect();
      console.log('🛑 MongoDB disconnected');
    } catch (error) {
      console.error('❌ Error disconnecting from MongoDB:', error);
    }

    process.exit(0);
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    console.error('❌ Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ==========================================
// UNHANDLED ERRORS
// ==========================================

process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Promise Rejection:', err);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

// ==========================================
// START SERVER
// ==========================================

// ==========================================
// CENTRALIZED ERROR HANDLING
// ==========================================

app.use((err, req, res, next) => {
  console.error(`❌ [${new Date().toISOString()}] Error:`, err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  // Hide stack trace in production
  const response = {
    success: false,
    message: statusCode === 500 && NODE_ENV === 'production' ? 'Internal Server Error' : message,
    ...(NODE_ENV !== 'production' && { stack: err.stack })
  };

  res.status(statusCode).json(response);
});

const startServer = async () => {
  try {
    // Connect to database (MUST await to prevent "bufferCommands=false" errors)
    console.log('🔄 Awaiting database connection...');
    const dbConnected = await connectDatabase().catch(err => {
      console.error('❌ Database connection error:', err.message);
      return false;
    });

    if (!dbConnected && NODE_ENV === 'production') {
      console.error('❌ FATAL: Could not connect to database in production. Exiting process.');
      process.exit(1);
    }
    console.log('✅ Database state confirmed');

    // Start HTTP server with Socket.io
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`
╔════════════════════════════════════════════════════════╗
║         🚀 PRODUCTION-READY BACKEND (RAILWAY)          ║
╠════════════════════════════════════════════════════════╣
║ ✅ Server running on: 0.0.0.0:${PORT}
║ ✅ Environment: ${NODE_ENV}
║ ✅ Socket.io: Enabled
║ ✅ CORS Origin: ${process.env.CORS_ORIGIN || 'All origins'}
║ ✅ Health check: GET http://localhost:${PORT}/
║ ✅ Socket.io events: connection, authenticate, echo, broadcast
╚════════════════════════════════════════════════════════╝
      `);
    });

    // Handle listen errors
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
      } else {
        console.error('❌ Server error:', err);
      }
      process.exit(1);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();

module.exports = { app, server, io };
