// ==========================================
// SOCKET.IO REAL-TIME MANAGER
// ==========================================

const Message = require('../models/Message');
const Notification = require('../models/Notification');
const User = require('../models/User');
const LiveSession = require('../models/LiveSession');
const { generateCallCode } = require('../utils/helpers');

const jwt = require('jsonwebtoken');

// Store active users (userId -> socketId)
const activeUsers = new Map();
// Store active live sessions (sessionCode -> sessionData)
const activeLiveSessions = new Map();
// Reverse mapping for cleanup (socketId -> { userId, sessionCode, role })
const socketMetadata = new Map();

// Constants for capacity management
const MAX_CONCURRENT_USERS = 5000;
const MAX_LIVE_SESSIONS = 500;

const setupSocketHandlers = (io) => {
  // 🔐 SECURITY: JWT Authentication Middleware for Socket.IO
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;

      if (!token) {
        console.warn('⚠️ Socket connection rejected: No token provided');
        return next(new Error('Authentication error: Token required'));
      }

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (!decoded || !decoded.id) {
        throw new Error('Invalid token structure');
      }

      // Fetch user from DB to ensure they still exist and are active
      const user = await User.findById(decoded.id).select('role status firstName lastName').lean();

      if (!user) {
        // Support virtual access-code users (prefixed with 'access_')
        if (decoded.type === 'access_code_verification' || String(decoded.id).startsWith('access_')) {
          socket.user = {
            id: decoded.id,
            _id: decoded.id,
            role: decoded.role || 'guest',
            firstName: decoded.firstName || 'Staff',
            lastName: 'Access',
            status: 'approved'
          };
        } else {
          return next(new Error('Authentication error: User not found'));
        }
      } else {
        socket.user = {
          ...user,
          id: user._id.toString()
        };
      }

      // Check account status
      if (socket.user.status === 'blocked' || socket.user.status === 'suspended') {
        return next(new Error(`Account ${socket.user.status}`));
      }

      next();
    } catch (err) {
      console.error('❌ Socket Auth Error:', err.message);
      return next(new Error('Authentication error: ' + err.message));
    }
  });

  // Capacity Check Middleware
  io.use((socket, next) => {
    if (activeUsers.size >= MAX_CONCURRENT_USERS) {
      console.warn('⚠️ Server at maximum user capacity. Rejecting connection:', socket.id);
      return next(new Error('Server busy. Please try again later.'));
    }
    next();
  });

  io.on('connection', (socket) => {
    const userId = socket.user.id;
    const userRole = socket.user.role;

    console.log(`✅ User connected: ${socket.user.firstName} (${userRole}) via ${socket.id}`);

    // Register active user
    activeUsers.set(userId, socket.id);
    socketMetadata.set(socket.id, { userId, role: userRole });

    // Join personal notification room
    socket.join(`notifications:${userId}`);

    // 🎯 JOIN ROLE-BASED ROOMS (Performance & Security broadcast refinement)
    if (['admin', 'assistant', 'developer'].includes(userRole)) {
      socket.join('role:staff');
    }
    if (userRole === 'admin') socket.join('role:admin');
    if (userRole === 'student') socket.join('role:student');

    // Join specific curriculum/grade rooms if student
    if (userRole === 'student' && socket.user.grade) {
      socket.join(`student:grade:${socket.user.grade}`);
      if (socket.user.curriculum) {
        socket.join(`student:curriculum:${socket.user.curriculum}`);
        socket.join(`student:target:${socket.user.grade}:${socket.user.curriculum}`);
      }
    }

    // ==========================================
    // USER PRESENCE
    // ==========================================

    socket.on('user:online', async () => {
      // Logic for status notification (if needed - handled by connection usually)
      await User.findByIdAndUpdate(userId, { isOnline: true });
      io.emit('user:status_changed', { userId, status: 'online' });
    });

    socket.on('user:offline', async (userId) => {
      activeUsers.delete(userId);
      socketMetadata.delete(socket.id);
      await User.findByIdAndUpdate(userId, { isOnline: false });
      // Broadcast to staff only for status changes (performance)
      io.to('role:staff').emit('user:status_changed', { userId, status: 'offline' });
    });

    // ==========================================
    // CHAT MESSAGES
    // ==========================================

    socket.on('message:send', async (data) => {
      try {
        const { fromId, toId, text, threadId } = data;

        const message = new Message({
          threadId: threadId || [fromId, toId].sort().join('-'),
          fromId,
          fromName: data.fromName,
          fromRole: data.fromRole,
          toId,
          text,
          type: 'text',
          status: 'sent'
        });

        await message.save();

        // Send to recipient
        const recipientSocket = activeUsers.get(toId);
        if (recipientSocket) {
          io.to(recipientSocket).emit('message:receive', message);
        }

        socket.emit('message:sent', message);
      } catch (error) {
        console.error('Message error:', error);
        socket.emit('message:error', { error: error.message });
      }
    });

    socket.on('message:read', async (data) => {
      try {
        const { messageId, toId } = data;
        await Message.findByIdAndUpdate(messageId, {
          status: 'read',
          readAt: new Date()
        });

        const recipientSocket = activeUsers.get(toId);
        if (recipientSocket) {
          io.to(recipientSocket).emit('message:mark_read', { messageId });
        }
      } catch (err) {
        console.error('Error in message:read:', err);
      }
    });

    socket.on('typing:start', (data) => {
      const { fromId, toId, fromName } = data;
      const recipientSocket = activeUsers.get(toId);
      if (recipientSocket) {
        io.to(recipientSocket).emit('typing:indicator', { fromId, fromName });
      }
    });

    socket.on('typing:stop', (data) => {
      const { fromId, toId } = data;
      const recipientSocket = activeUsers.get(toId);
      if (recipientSocket) {
        io.to(recipientSocket).emit('typing:stop', { fromId });
      }
    });

    // ==========================================
    // NOTIFICATIONS
    // ==========================================

    socket.on('notification:subscribe', (userId) => {
      socket.join(`notifications:${userId}`);
    });

    socket.on('notification:unsubscribe', (userId) => {
      socket.leave(`notifications:${userId}`);
    });

    socket.on('notification:send', async (data) => {
      try {
        const { recipientId, title, message, type, refId } = data;

        const notification = new Notification({
          recipientId,
          title,
          message,
          type: type || 'system',
          refId
        });

        await notification.save();

        io.to(`notifications:${recipientId}`).emit('notification:new', notification);
      } catch (err) {
        console.error('Error in notification:send:', err);
      }
    });

    // ==========================================
    // LIVE CLASS/CALL
    // ==========================================

    socket.on('live:create_session', async (data) => {
      try {
        const { hostId, title, audience } = data;
        console.log(`📡 Request to create live session: "${title}" by Host: ${hostId}`);

        if (!hostId) {
          throw new Error('Host ID is missing in request');
        }

        // Fetch host details to ensure we have a name
        const hostUser = await User.findById(hostId);
        const hostName = hostUser ? `${hostUser.firstName} ${hostUser.lastName}` : 'Host';
        const hostRole = hostUser ? hostUser.role : 'host';

        const sessionCode = generateCallCode();

        const session = new LiveSession({
          sessionCode,
          title,
          hostId,
          hostName,
          hostRole,
          audience: audience || 'all',
          active: true,
          participants: [{ userId: hostId, name: hostName, role: hostRole, joinedAt: new Date() }]
        });

        await session.save();
        console.log(`✅ Live session created in DB: ${sessionCode} (Host: ${hostName})`);

        activeLiveSessions.set(sessionCode, {
          sessionId: session._id,
          title,
          audience: audience || 'all',
          participants: [{ userId: hostId, name: hostName, role: hostRole, joinedAt: new Date(), socketId: socket.id }]
        });

        socket.join(`live:${sessionCode}`);

        // Track which session this socket belongs to
        const meta = socketMetadata.get(socket.id) || {};
        socketMetadata.set(socket.id, { ...meta, userId: hostId, sessionCode });

        console.log(`🔌 Host socket ${socket.id} joined room live:${sessionCode}`);

        // Emit to staff or relevant grade/curriculum rooms
        if (audience === 'all') {
          io.to('role:student').emit('live:session_created', {
            sessionCode,
            title,
            hostId: (hostId || '').toString(),
            participants: 1
          });
        } else if (audience && audience.includes(':')) {
          io.to(`student:target:${audience}`).emit('live:session_created', {
            sessionCode,
            title,
            hostId: (hostId || '').toString(),
            participants: 1
          });
        }

        // Always notify staff
        io.to('role:staff').emit('live:session_created', {
          sessionCode,
          title,
          hostId: (hostId || '').toString(),
          participants: 1
        });

        console.log(`📢 Target broadcasted live:session_created for ${sessionCode}`);
      } catch (err) {
        console.error('❌ Error creating live session:', err.message);
        socket.emit('live:error', { error: `Failed to create session: ${err.message}` });
      }
    });

    socket.on('live:join', async (data) => {
      try {
        const { sessionCode, userId, userName, userRole } = data;
        console.log(`📡 Request to join session: ${sessionCode} by ${userName} (${userId})`);

        let session = activeLiveSessions.get(sessionCode);

        // 🔄 Recovery: Check database if not in memory
        if (!session) {
          console.log(`⚠️ Session ${sessionCode} not in memory, checking DB...`);
          const dbSession = await LiveSession.findOne({ sessionCode, active: true });

          if (dbSession) {
            console.log(`✅ Recovered session ${sessionCode} from DB`);
            session = {
              sessionId: dbSession._id,
              title: dbSession.title,
              audience: dbSession.audience,
              participants: dbSession.participants.map(p => ({
                userId: p.userId.toString(),
                name: p.name,
                role: p.role,
                joinedAt: p.joinedAt,
                socketId: null // We don't know their socketId yet
              }))
            };
            activeLiveSessions.set(sessionCode, session);
          } else {
            console.log(`❌ Session not found in DB or inactive: ${sessionCode}`);
            socket.emit('live:error', { error: 'Session not found or already ended' });
            return;
          }
        }

        socket.join(`live:${sessionCode}`);

        // Track which session this socket belongs to
        const meta = socketMetadata.get(socket.id) || {};
        socketMetadata.set(socket.id, { ...meta, userId, sessionCode });

        // Avoid duplicates in tracking
        const existingIdx = session.participants.findIndex(p => p.userId === userId);
        if (existingIdx === -1) {
          session.participants.push({ userId, name: userName, role: userRole, joinedAt: new Date(), socketId: socket.id });
        } else {
          session.participants[existingIdx].socketId = socket.id; // Update socket icon
        }

        // Atomic DB update
        try {
          const updated = await LiveSession.findByIdAndUpdate(session.sessionId, {
            $pull: { participants: { userId } },
            $push: { participants: { userId, name: userName, role: userRole, joinedAt: new Date() } }
          }, { new: true });

          const totalParticipants = (updated && updated.participants) ? updated.participants.length : session.participants.length;

          io.to(`live:${sessionCode}`).emit('live:user_joined', {
            userId,
            userName,
            userRole,
            sessionCode,
            totalParticipants,
            allParticipants: session.participants // Send everyone so UI can rebuild
          });
        } catch (err) {
          console.error('Error updating participants in DB:', err);
        }
        console.log(`✅ User ${userName} joined session ${sessionCode}`);
      } catch (err) {
        console.error('❌ Error joining live session:', err.message);
        socket.emit('live:error', { error: `Failed to join session: ${err.message}` });
      }
    });

    socket.on('live:leave', async (data) => {
      const { sessionCode, userId } = data;

      const session = activeLiveSessions.get(sessionCode);
      if (!session) return;

      const idx = session.participants.findIndex(p => p.userId === userId);
      if (idx > -1) {
        session.participants.splice(idx, 1);
      }

      socket.leave(`live:${sessionCode}`);
      socketMetadata.delete(socket.id);

      io.to(`live:${sessionCode}`).emit('live:user_left', {
        userId,
        totalParticipants: session.participants.length
      });

      // Close session if no participants remaining and it was a student leaving after host left
      if (session.participants.length === 0) {
        activeLiveSessions.delete(sessionCode);
        await LiveSession.findByIdAndUpdate(session.sessionId, {
          active: false,
          endedAt: new Date()
        });
      }
    });

    // ==========================================
    // USER EXIT FROM CALL (Keep Session Active)
    // ==========================================

    socket.on('live:user_exit', async (data) => {
      const { sessionCode, userId, userName, userRole } = data;

      console.log(`🚪 User ${userName} (${userRole}) is exiting call: ${sessionCode}`);

      const session = activeLiveSessions.get(sessionCode);
      if (!session) {
        console.log(`⚠️ Session not found: ${sessionCode}`);
        return;
      }

      // Remove participant from tracking
      const index = session.participants.findIndex(p => p.userId === userId);
      if (index > -1) {
        session.participants.splice(index, 1);
      }

      // Leave the socket room
      socket.leave(`live:${sessionCode}`);
      socketMetadata.delete(socket.id);

      // Notify other participants about the exit
      io.to(`live:${sessionCode}`).emit('live:user_exited', {
        userId,
        userName,
        userRole,
        totalParticipants: session.participants.length,
        message: `${userName} (${userRole}) has exited the call`
      });

      console.log(`✓ Exit processed. Remaining participants: ${session.participants.length}`);
    });

    socket.on('live:screen_share', (data) => {
      const { sessionCode, userId } = data;
      io.to(`live:${sessionCode}`).emit('live:screen_shared', { userId });
    });

    socket.on('live:stop_screen_share', (data) => {
      const { sessionCode, userId } = data;
      io.to(`live:${sessionCode}`).emit('live:screen_stopped', { userId });
    });

    socket.on('live:end_session', async (data) => {
      const { sessionCode, callerId } = data;
      const session = activeLiveSessions.get(sessionCode);
      if (!session) return;

      // Verify caller is host (or check callerId if provided)
      const participant = session.participants.find(p => p.userId === (callerId || socketMetadata.get(socket.id)?.userId));
      const hasPermission = participant && ['admin', 'assistant', 'developer', 'host'].includes(participant.role);

      if (!hasPermission) {
        socket.emit('live:error', { error: 'Unauthorized to end session' });
        console.warn(`Unauthorized end_session attempt by ${callerId} for ${sessionCode}`);
        return;
      }

      activeLiveSessions.delete(sessionCode);
      await LiveSession.findByIdAndUpdate(session.sessionId, {
        active: false,
        endedAt: new Date()
      });

      io.to(`live:${sessionCode}`).emit('live:session_ended', { sessionCode });
      console.log(`📡 Session ${sessionCode} ended by host ${callerId}`);
    });

    socket.on('live:kick_user', async (data) => {
      const { sessionCode, userId: targetUserId } = data;
      const session = activeLiveSessions.get(sessionCode);
      if (!session) return;

      // Only host/admin can kick
      const meta = socketMetadata.get(socket.id);
      const caller = session.participants.find(p => p.userId === meta?.userId);
      if (!caller || !['host', 'admin', 'assistant', 'developer'].includes(caller.role)) {
        socket.emit('live:error', { error: 'Unauthorized to kick user' });
        return;
      }

      // Validate target is participant
      const idx = session.participants.findIndex(p => p.userId === targetUserId);
      if (idx === -1) {
        socket.emit('live:error', { error: 'Target user not in session' });
        return;
      }

      const target = session.participants[idx];
      session.participants.splice(idx, 1);

      try {
        await LiveSession.findByIdAndUpdate(session.sessionId, { $pull: { participants: { userId: targetUserId } } });
      } catch (err) {
        console.error('Error removing participant from DB:', err);
      }

      // Find target socket and notify
      if (target.socketId) {
        io.to(target.socketId).emit('live:you_were_kicked', { sessionCode });
      }

      io.to(`live:${sessionCode}`).emit('live:user_kicked', { userId: targetUserId });
      console.log(`📡 User ${targetUserId} kicked from session ${sessionCode}`);
    });

    socket.on('live:mute_user', (data) => {
      const { sessionCode, userId } = data;
      const session = activeLiveSessions.get(sessionCode);
      if (!session) return;

      const meta = socketMetadata.get(socket.id);
      const callerSource = session.participants.find(p => p.userId === meta?.userId);

      if (!callerSource || !['host', 'admin', 'assistant', 'developer'].includes(callerSource.role)) {
        socket.emit('live:error', { error: 'Unauthorized to mute user' });
        return;
      }

      io.to(`live:${sessionCode}`).emit('live:user_muted', { userId });
      console.log(`📡 User ${userId} muted in session ${sessionCode}`);
    });

    socket.on('live:share_file', async (data) => {
      const { sessionCode, fileName, fileSize, mimeType, uploadedBy, fileData } = data;

      // NOTE: We allow fileData as a convenience but warn in logs
      if (fileData && fileData.length > 5 * 1024 * 1024) {
        socket.emit('live:error', { error: 'File too large' });
        return;
      }

      io.to(`live:${sessionCode}`).emit('live:file_shared', { fileName, fileSize, mimeType, uploadedBy, fileData });
      console.log(`📡 File shared in session ${sessionCode}: ${fileName}`);
    });

    // ==========================================
    // WEBRTC SIGNALING
    // ==========================================

    socket.on('webrtc:offer', (data) => {
      const { to, offer } = data;
      const recipientSocket = activeUsers.get(to);
      const from = socketMetadata.get(socket.id);
      if (recipientSocket && from?.userId) {
        io.to(recipientSocket).emit('webrtc:offer', { offer, from: from.userId });
      }
    });

    socket.on('webrtc:answer', (data) => {
      const { to, answer } = data;
      const recipientSocket = activeUsers.get(to);
      const from = socketMetadata.get(socket.id);
      if (recipientSocket && from?.userId) {
        io.to(recipientSocket).emit('webrtc:answer', { answer, from: from.userId });
      }
    });

    socket.on('webrtc:ice_candidate', (data) => {
      const { to, candidate } = data;
      const recipientSocket = activeUsers.get(to);
      const from = socketMetadata.get(socket.id);
      if (recipientSocket && from?.userId) {
        io.to(recipientSocket).emit('webrtc:ice_candidate', { candidate, from: from.userId });
      }
    });

    // ==========================================
    // ORDER NOTIFICATIONS
    // ==========================================

    socket.on('order:broadcast', (data) => {
      // Only notify staff about new orders
      io.to('role:staff').emit('order:new', data);
    });

    socket.on('order:status_update', (data) => {
      // Notify staff and the specific student
      io.to('role:staff').emit('order:status_changed', data);
      if (data.userId) {
        io.to(`notifications:${data.userId}`).emit('order:status_changed', data);
      }
    });

    // ==========================================
    // DISCONNECT
    // ==========================================

    socket.on('disconnect', async () => {
      console.log(`❌ User disconnected: ${socket.id}`);

      const meta = socketMetadata.get(socket.id);
      if (meta) {
        const { userId, sessionCode } = meta;

        // Clean up active users
        activeUsers.delete(userId);
        socketMetadata.delete(socket.id);

        await User.findByIdAndUpdate(userId, { isOnline: false });
        // Notify staff (performance - don't broadcast to all students)
        io.to('role:staff').emit('user:status_changed', { userId, status: 'offline' });

        // Clean up live sessions
        if (sessionCode) {
          const session = activeLiveSessions.get(sessionCode);
          if (session) {
            const index = session.participants.findIndex(p => p.userId === userId);
            if (index > -1) {
              session.participants.splice(index, 1);

              // Notify others
              io.to(`live:${sessionCode}`).emit('live:user_left', {
                userId,
                totalParticipants: session.participants.length
              });

              // Close session if no participants remaining
              if (session.participants.length === 0) {
                activeLiveSessions.delete(sessionCode);
                await LiveSession.findByIdAndUpdate(session.sessionId, {
                  active: false,
                  endedAt: new Date()
                });
              }
            }
          }
        }
      }
    });
  });
};

module.exports = {
  setupSocketHandlers,
  activeUsers,
  activeLiveSessions
};
