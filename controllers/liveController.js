const LiveSession = require('../models/LiveSession');
const User = require('../models/User');
const { generateCallCode } = require('../utils/helpers');

// ==========================================
// GET /api/live-sessions — List active sessions
// ==========================================
exports.getActiveSessions = async (req, res) => {
    console.log('📡 GET /api/live-sessions called by:', req.user?.id || 'anonymous');
    try {
        const sessions = await LiveSession.find({ active: true })
            .select('sessionCode title hostId participants startedAt audience')
            .sort({ startedAt: -1 });

        res.status(200).json({
            success: true,
            data: sessions
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// ==========================================
// POST /api/live-sessions/validate-code — Validate session code BEFORE opening camera
// This is the CORE FIX: Frontend must call this BEFORE opening any media.
// ==========================================
exports.validateCode = async (req, res) => {
    try {
        const { code } = req.body;
        const userId = req.user?.id;

        if (!code || typeof code !== 'string' || code.length < 4) {
            return res.status(400).json({
                success: false,
                message: 'Invalid session code format'
            });
        }

        const normalizedCode = code.trim().toUpperCase();

        // Find active session in DB
        const session = await LiveSession.findOne({
            sessionCode: normalizedCode,
            active: true
        }).lean();

        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Session not found or has ended'
            });
        }

        // ✅ SERVER-SIDE audience validation (moved from client)
        if (userId && session.audience !== 'all') {
            const user = await User.findById(userId).select('grade curriculum role').lean();

            if (user && user.role === 'student') {
                const audience = session.audience;
                let allowed = false;

                if (audience === 'all') {
                    allowed = true;
                } else if (audience === 'american') {
                    allowed = user.curriculum === 'american';
                } else if (audience === 'national') {
                    allowed = user.curriculum === 'national';
                } else if (audience.startsWith('grade')) {
                    allowed = String(user.grade) === audience.replace('grade', '');
                } else if (audience.includes(':')) {
                    // Format: "grade:curriculum" e.g. "10:american"
                    const [gradeStr, currStr] = audience.split(':');
                    allowed = String(user.grade) === gradeStr && user.curriculum === currStr;
                } else {
                    allowed = true; // Unknown audience format → allow
                }

                if (!allowed) {
                    return res.status(403).json({
                        success: false,
                        message: 'You do not have permission to join this session (grade/curriculum mismatch)'
                    });
                }
            }
        }

        // ✅ Return session data (without sensitive fields) for UI rendering
        return res.status(200).json({
            success: true,
            message: 'Session valid. You may join.',
            data: {
                sessionCode: session.sessionCode,
                title: session.title,
                audience: session.audience,
                hostId: session.hostId?.toString(),
                hostName: session.hostName,
                participantCount: (session.participants || []).filter(p => !p.leftAt).length,
                startedAt: session.startedAt
            }
        });
    } catch (error) {
        console.error('❌ Error validating live session code:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while validating session code'
        });
    }
};

// ==========================================
// POST /api/live-sessions/create — Create session via REST API (not just Socket)
// ==========================================
exports.createSession = async (req, res) => {
    try {
        const { title, audience } = req.body;
        const hostId = req.user?.id;

        if (!hostId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        // Only staff can create sessions
        const user = await User.findById(hostId).select('role firstName lastName').lean();
        if (!user || !['admin', 'assistant', 'developer', 'teacher'].includes(user.role)) {
            return res.status(403).json({
                success: false,
                message: 'Only staff members can create live sessions'
            });
        }

        const sessionCode = generateCallCode();
        const hostName = `${user.firstName} ${user.lastName}`;

        const session = new LiveSession({
            sessionCode,
            title: title || 'Live Session',
            hostId,
            hostName,
            hostRole: user.role,
            audience: audience || 'all',
            active: true,
            participants: [{ userId: hostId, name: hostName, role: user.role, joinedAt: new Date() }]
        });

        await session.save();
        console.log(`✅ Live session created via API: ${sessionCode} (Host: ${hostName})`);

        return res.status(201).json({
            success: true,
            message: 'Live session created',
            data: {
                sessionCode,
                title: session.title,
                audience: session.audience,
                hostId: hostId.toString(),
                hostName,
                startedAt: session.startedAt
            }
        });
    } catch (error) {
        console.error('❌ Error creating live session via API:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while creating live session'
        });
    }
};

// ==========================================
// POST /api/live-sessions/:code/recording — Upload recording
// ==========================================
exports.uploadRecording = async (req, res) => {
    try {
        const { code } = req.params;
        const hostId = req.user?.id;

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No recording file provided'
            });
        }

        const session = await LiveSession.findOne({ sessionCode: code });
        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }

        // Only allow the host (or admin) to upload recording
        if (session.hostId.toString() !== hostId && req.user?.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Only the session host can upload recordings'
            });
        }

        const { uploadFile } = require('../services/s3Service');
        
        // Upload to S3/R2
        const recordingUrl = await uploadFile(req.file, 'live-recordings');

        // Save URL to DB
        session.recordingUrl = recordingUrl;
        await session.save();

        console.log(`✅ Recording uploaded for session ${code}: ${recordingUrl}`);

        res.status(200).json({
            success: true,
            message: 'Recording uploaded successfully',
            data: { recordingUrl }
        });

    } catch (error) {
        console.error('❌ Error uploading live session recording:', error);
        res.status(500).json({
            success: false,
            message: 'Server error while uploading recording'
        });
    } finally {
        // Clean up multer temp file in all cases (early exits, failures, successes)
        if (req.file && req.file.path) {
            const fs = require('fs');
            if (fs.existsSync(req.file.path)) {
                try {
                    fs.unlinkSync(req.file.path);
                    console.log(`🧹 Cleaned up local temp recording file: ${req.file.path}`);
                } catch (err) {
                    console.error('Failed to cleanup temp recording file:', err.message);
                }
            }
        }
    }
};

// ==========================================
// POST /api/live-sessions/:code/share-file — Upload shared file
// ==========================================
exports.uploadSharedFile = async (req, res) => {
    try {
        const { code } = req.params;

        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file provided' });
        }

        const session = await LiveSession.findOne({ sessionCode: code });
        if (!session) return res.status(404).json({ success: false, message: 'Session not found' });

        // Security Fix: Verify user is host or participant
        const isHost = session.hostId.toString() === req.user.id;
        const isParticipant = session.participants.some(p => p.userId.toString() === req.user.id && !p.leftAt);
        
        if (!isHost && !isParticipant && req.user.role !== 'admin') {
            return res.status(403).json({ success: false, message: 'Unauthorized to share files in this session' });
        }
        
        // Security Fix: Validate mime types to prevent malicious uploads
        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
        if (!allowedTypes.includes(req.file.mimetype)) {
            return res.status(400).json({ success: false, message: 'Invalid file type. Only PDF, Images and Word docs allowed.' });
        }

        const { uploadFile } = require('../services/s3Service');
        const fileUrl = await uploadFile(req.file, 'live-shared-files');

        // Optional: you could save this to the DB if you want to persist shared files for the session
        // For now, we just return the URL so the frontend can broadcast it via socket
        res.status(200).json({
            success: true,
            data: {
                fileName: req.file.originalname,
                fileUrl,
                mimeType: req.file.mimetype,
                fileSize: req.file.size
            }
        });

    } catch (error) {
        console.error('❌ Error uploading shared file:', error);
        res.status(500).json({ success: false, message: 'Server error while uploading file' });
    } finally {
        // Clean up multer temp file in all cases (early exits, failures, successes)
        if (req.file && req.file.path) {
            const fs = require('fs');
            if (fs.existsSync(req.file.path)) {
                try {
                    fs.unlinkSync(req.file.path);
                    console.log(`🧹 Cleaned up local temp shared file: ${req.file.path}`);
                } catch (err) {
                    console.error('Failed to cleanup temp shared file:', err.message);
                }
            }
        }
    }
};

// ==========================================
// ZONES API
// ==========================================

exports.createZone = async (req, res) => {
    try {
        const { code } = req.params;
        const { zoneName, maxCapacity } = req.body;
        
        const session = await LiveSession.findOne({ sessionCode: code });
        if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
        
        // Only staff can create zones
        if (session.hostId.toString() !== req.user?.id && !['admin', 'assistant', 'developer'].includes(req.user?.role)) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }
        
        const zoneId = `zone_${Date.now()}`;
        const newZone = { zoneId, zoneName: zoneName || 'New Zone', maxCapacity: maxCapacity || 50, participants: [] };
        
        session.zones.push(newZone);
        await session.save();
        
        res.status(201).json({ success: true, data: newZone });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.getZones = async (req, res) => {
    try {
        const { code } = req.params;
        const session = await LiveSession.findOne({ sessionCode: code }).select('zones');
        if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
        
        res.status(200).json({ success: true, data: session.zones });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.joinZone = async (req, res) => {
    try {
        const { code, zoneId } = req.params;
        const userId = req.user?.id;
        
        const session = await LiveSession.findOne({ sessionCode: code });
        if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
        
        const zone = session.zones.find(z => z.zoneId === zoneId);
        if (!zone) return res.status(404).json({ success: false, message: 'Zone not found' });
        
        if (zone.participants.length >= zone.maxCapacity) {
            return res.status(400).json({ success: false, message: 'Zone is full' });
        }
        
        // Remove from other zones first
        session.zones.forEach(z => {
            z.participants = z.participants.filter(p => p.userId.toString() !== userId);
        });
        
        // Add to new zone
        const user = await User.findById(userId).select('firstName lastName').lean();
        zone.participants.push({ userId, name: `${user.firstName} ${user.lastName}` });
        
        await session.save();
        
        res.status(200).json({ success: true, message: 'Joined zone' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
