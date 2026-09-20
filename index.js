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
  'https://elraouf.com',
  'https://www.elraouf.com',
  'https://airy-miracle-production.up.railway.app',
  'https://elmnsa-backend-production.up.railway.app',
  'http://localhost:8000',
  'http://localhost:5000',
  'http://localhost:3000'
];

// Always include defaultOrigins + any extra origins from env var
const envOrigins = process.env.CORS_ORIGIN 
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim()) 
  : [];
let allowedOrigins = [...new Set([...defaultOrigins, ...envOrigins])];
console.log('🔐 CORS allowed origins:', allowedOrigins);

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
  origin: function (origin, callback) {
    // Allow server-to-server requests with no origin
    if (!origin) return callback(null, true);

    // ✅ CORS tightening — exact list match only, no wildcard suffix
    const isAllowed = allowedOrigins.includes(origin);

    if (isAllowed) {
      callback(null, true);
    } else {
      console.warn(`⚠️ [SECURITY] CORS blocked for origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'X-Device-ID']
};

app.use(cors(corsOptions));

// ==========================================
// SECURITY MIDDLEWARE
// ==========================================

const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss');
const hpp = require('hpp');

// ✅ CSP Hardening — removes unsafe-inline and unsafe-eval from scriptSrc
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],                              // ❌ no unsafe-inline / unsafe-eval
      styleSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"], // CSS inline OK
      imgSrc:     ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:", "https:"],
      fontSrc:    ["'self'", "https://fonts.gstatic.com"],
      objectSrc:  ["'none'"],
      frameSrc:   ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  }
}));

// Data sanitization against NoSQL query injection
// replaceWith: '_' replaces any $ or . in keys, onSanitize logs the attempt
app.use(mongoSanitize({
  replaceWith: '_',
  onSanitize: ({ req, key }) => {
    console.warn(`⚠️ [SECURITY] Sanitized suspicious field: "${key}" from IP: ${req.ip}`);
  }
}));

// Data sanitization against XSS using the 'xss' library
const filterXSS = xss;
app.use((req, res, next) => {
  try {
    const sanitizeObject = (obj, depth = 0) => {
      if (!obj || typeof obj !== 'object' || depth > 5) return obj;
      for (const k of Object.keys(obj)) {
        // Skip password-related fields — they're hashed, not rendered
        if (/password|secret|token|key/i.test(k)) continue;
        if (typeof obj[k] === 'string') {
          obj[k] = filterXSS(obj[k]);
        } else if (typeof obj[k] === 'object') {
          sanitizeObject(obj[k], depth + 1);
        }
      }
    };

    // Sanitize body and query — NOT params (params like ObjectId are not rendered)
    sanitizeObject(req.body);
    sanitizeObject(req.query);
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

// General API limiter
const limiter = rateLimit({
  windowMs: (parseInt(process.env.RATE_LIMIT_WINDOW) || 15) * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 1000, // Increased from 500 to 1000 for better UX
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use x-forwarded-for header (from reverse proxy) if available, otherwise use req.ip
    const forwarded = req.headers['x-forwarded-for'];
    return (forwarded && forwarded.split(',')[0].trim()) || req.ip || 'global_fallback';
  },
  message: { success: false, message: 'Too many requests from this user, please try again later.' },
  skip: (req) => req.method === 'OPTIONS', // Don't limit pre-flight requests
});

// ✅ Stricter limiter for login/access-code (10 attempts per 15 min per IP)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // ✅ reduced from 40 → 10
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    return (forwarded && forwarded.split(',')[0].trim()) || req.ip || 'global_fallback';
  },
  message: { success: false, message: 'Too many login attempts, please try again after 15 minutes.' }
});

// ✅ Registration limiter — 5 accounts per IP per hour (prevents mass fake signups)
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    return (forwarded && forwarded.split(',')[0].trim()) || req.ip || 'global_fallback';
  },
  message: { success: false, message: 'Too many registration attempts from this IP. Try again in an hour.' }
});

// ✅ Password reset limiter — 5 attempts per phone number per hour
const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Key by phone number to prevent reset spam across IPs
    const phone = (req.body?.phoneNumber || '').replace(/\D/g, '');
    if (phone && phone.length >= 10) return `reset:phone:${phone}`;
    const forwarded = req.headers['x-forwarded-for'];
    return `reset:ip:${(forwarded && forwarded.split(',')[0].trim()) || req.ip || 'global_fallback'}`;
  },
  message: { success: false, message: 'Too many password reset attempts. Please try again in an hour.' }
});

// ✅ Lock code limiter — 10 attempts per IP per hour (prevents brute-force on 4-digit code)
const lockLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    return (forwarded && forwarded.split(',')[0].trim()) || req.ip || 'global_fallback';
  },
  message: { success: false, message: 'Too many lock code attempts. Please try again in an hour.' }
});

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', registerLimiter);          // ✅ dedicated register limiter
app.use('/api/auth/verify-access-code', authLimiter);
app.use('/api/auth/request-password-reset', resetLimiter); // ✅ reset limiter
app.use('/api/auth/verify-reset-fallback',  resetLimiter); // ✅ reset limiter
app.use('/api/auth/verify-reset-otp',       resetLimiter); // ✅ reset limiter
app.use('/api/auth/reset-password',         resetLimiter); // ✅ reset limiter
app.use('/api/auth/login-with-lock', lockLimiter);         // ✅ lock code limiter
app.use('/api/', limiter);

// ✅ Admin Access Logging & IP Whitelist Middleware
app.use('/api/admin', async (req, res, next) => {
  try {
    // 1. IP Whitelisting Check
    const allowedIpsStr = process.env.ADMIN_ALLOWED_IPS;
    if (allowedIpsStr && allowedIpsStr.trim().length > 0) {
      const allowedIps = allowedIpsStr.split(',').map(ip => ip.trim());
      const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip;
      
      if (!allowedIps.includes(clientIp)) {
        console.warn(`🛑 [SECURITY] Blocked unauthorized IP (${clientIp}) attempting to access Admin Panel.`);
        return res.status(403).json({ success: false, message: 'Access denied: IP not whitelisted.' });
      }
    }

    // 2. Logging
    const forwarded = req.headers['x-forwarded-for'];
    const ip = (forwarded && forwarded.split(',')[0].trim()) || req.ip || 'unknown';
    const user = req.user ? `${req.user._id} (${req.user.role})` : 'unauthenticated';
    console.log(`[ADMIN ACCESS] ${new Date().toISOString()} | IP: ${ip} | User: ${user} | ${req.method} ${req.path}`);
    next();
  } catch (err) {
    next(err);
  }
});

// ==========================================
// EXPRESS MIDDLEWARE
// ==========================================

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// 🔒 PROTECTED: uploads contain private videos/files.
// Served only to authenticated users — the video player uses /api/videos/stream.
const path = require('path');
const { authMiddleware } = require('./middleware/auth');
app.use('/uploads', authMiddleware, express.static(path.join(__dirname, 'uploads')));

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
const whatsappRoutes = require('./routes/whatsapp');
const examsRoutes = require('./routes/exams');
const examCodesRoutes = require('./routes/examCodes');


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
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/exams', examsRoutes);
app.use('/api/exam-codes', examCodesRoutes);

app.use('/api/profile-requests', require('./routes/profileRequests'));
app.use('/api/live-sessions', require('./routes/live-sessions'));

// ==========================================
// BACKGROUND SERVICES
// ==========================================
const { startCleanupService } = require('./services/cleanupService');
startCleanupService();

// WhatsApp Automation Service (lazy init after DB connection)
const whatsappService = require('./services/whatsappService');


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

    // Disconnect WhatsApp client
    try {
      await whatsappService.disconnect();
      console.log('🛑 WhatsApp disconnected');
    } catch (error) {
      console.error('❌ Error disconnecting WhatsApp:', error);
    }

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

    // Initialize WhatsApp after DB is connected
    if (dbConnected) {
      try {
        console.log('📱 Initializing WhatsApp Automation Service...');
        await whatsappService.initialize(io);
      } catch (waError) {
        console.error('⚠️ WhatsApp init error (non-fatal):', waError.message);
      }
    }

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
║ ✅ WhatsApp: Automation Engine Active
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
