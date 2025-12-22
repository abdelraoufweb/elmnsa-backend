// ==========================================
// SOCKET.IO REAL-TIME MANAGER
// ==========================================

const Message = require('../models/Message');
const Notification = require('../models/Notification');
const User = require('../models/User');
const LiveSession = require('../models/LiveSession');
const { generateCallCode } = require('../utils/helpers');

// Store active users
const activeUsers = new Map();
const activeLiveSessions = new Map();

const setupSocketHandlers = (io) => {
  io.on('connection', (socket) => {
    console.log(`✅ User connected: ${socket.id}`);

    // ==========================================
    // USER PRESENCE
    // ==========================================

    socket.on('user:online', async (userId) => {
      activeUsers.set(userId, socket.id);
      await User.findByIdAndUpdate(userId, { isOnline: true });
      io.emit('user:status_changed', { userId, status: 'online' });
    });

    socket.on('user:offline', async (userId) => {
      activeUsers.delete(userId);
      await User.findByIdAndUpdate(userId, { isOnline: false });
      io.emit('user:status_changed', { userId, status: 'offline' });
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
      const { messageId, toId } = data;
      await Message.findByIdAndUpdate(messageId, {
        status: 'read',
        readAt: new Date()
      });

      const recipientSocket = activeUsers.get(toId);
      if (recipientSocket) {
        io.to(recipientSocket).emit('message:mark_read', { messageId });
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
    });

    // ==========================================
    // LIVE CLASS/CALL
    // ==========================================

    socket.on('live:create_session', async (data) => {
      const { hostId, title, audience } = data;
      const sessionCode = generateCallCode();

      const session = new LiveSession({
        sessionCode,
        title,
        hostId,
        audience: audience || 'all',
        active: true
      });

      await session.save();
      activeLiveSessions.set(sessionCode, {
        sessionId: session._id,
        participants: [hostId]
      });

      socket.join(`live:${sessionCode}`);
      io.emit('live:session_created', {
        sessionCode,
        title,
        hostId,
        participants: 1
      });
    });

    socket.on('live:join', async (data) => {
      const { sessionCode, userId, userName, userRole } = data;

      const session = activeLiveSessions.get(sessionCode);
      if (!session) {
        socket.emit('live:error', { error: 'Session not found' });
        return;
      }

      socket.join(`live:${sessionCode}`);
      session.participants.push(userId);

      // Update in database
      await LiveSession.findByIdAndUpdate(session.sessionId, {
        $push: {
          participants: {
            userId,
            name: userName,
            role: userRole,
            joinedAt: new Date()
          }
        }
      });

      io.to(`live:${sessionCode}`).emit('live:user_joined', {
        userId,
        userName,
        userRole,
        totalParticipants: session.participants.length
      });
    });

    socket.on('live:leave', async (data) => {
      const { sessionCode, userId } = data;

      const session = activeLiveSessions.get(sessionCode);
      if (!session) return;

      const index = session.participants.indexOf(userId);
      if (index > -1) {
        session.participants.splice(index, 1);
      }

      socket.leave(`live:${sessionCode}`);

      io.to(`live:${sessionCode}`).emit('live:user_left', {
        userId,
        totalParticipants: session.participants.length
      });

      // Close session if no participants
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
      const index = session.participants.findIndex(p => 
        typeof p === 'string' ? p === userId : p.userId === userId
      );
      if (index > -1) {
        session.participants.splice(index, 1);
      }

      // Leave the socket room
      socket.leave(`live:${sessionCode}`);

      // Notify other participants about the exit (NOT session end)
      io.to(`live:${sessionCode}`).emit('live:user_exited', {
        userId,
        userName,
        userRole,
        totalParticipants: session.participants.length,
        message: `${userName} (${userRole}) has exited the call`
      });

      console.log(`✓ Exit processed. Remaining participants: ${session.participants.length}`);

      // ⚠️ DO NOT close session if participants list becomes empty
      // Only the host can end the session with 'live:end_session'
    });

    socket.on('live:screen_share', (data) => {
      const { sessionCode, userId } = data;
      io.to(`live:${sessionCode}`).emit('live:screen_shared', { userId });
    });

    socket.on('live:stop_screen_share', (data) => {
      const { sessionCode, userId } = data;
      io.to(`live:${sessionCode}`).emit('live:screen_stopped', { userId });
    });

    // ==========================================
    // WEBRTC SIGNALING
    // ==========================================

    socket.on('webrtc:offer', (data) => {
      const { to, offer, sessionCode } = data;
      const recipientSocket = activeUsers.get(to);
      if (recipientSocket) {
        io.to(recipientSocket).emit('webrtc:offer', { offer, from: socket.id });
      }
    });

    socket.on('webrtc:answer', (data) => {
      const { to, answer, sessionCode } = data;
      const recipientSocket = activeUsers.get(to);
      if (recipientSocket) {
        io.to(recipientSocket).emit('webrtc:answer', { answer, from: socket.id });
      }
    });

    socket.on('webrtc:ice_candidate', (data) => {
      const { to, candidate } = data;
      const recipientSocket = activeUsers.get(to);
      if (recipientSocket) {
        io.to(recipientSocket).emit('webrtc:ice_candidate', { candidate, from: socket.id });
      }
    });

    // ==========================================
    // ORDER NOTIFICATIONS
    // ==========================================

    socket.on('order:broadcast', (data) => {
      io.emit('order:new', data);
    });

    socket.on('order:status_update', (data) => {
      io.emit('order:status_changed', data);
    });

    // ==========================================
    // DISCONNECT
    // ==========================================

    socket.on('disconnect', async () => {
      console.log(`❌ User disconnected: ${socket.id}`);

      // Find and remove user from active users
      for (const [userId, socketId] of activeUsers.entries()) {
        if (socketId === socket.id) {
          activeUsers.delete(userId);
          await User.findByIdAndUpdate(userId, { isOnline: false });
          io.emit('user:status_changed', { userId, status: 'offline' });
          break;
        }
      }

      // Clean up live sessions
      for (const [code, session] of activeLiveSessions.entries()) {
        const index = session.participants.indexOf(socket.id);
        if (index > -1) {
          session.participants.splice(index, 1);
          if (session.participants.length === 0) {
            activeLiveSessions.delete(code);
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
