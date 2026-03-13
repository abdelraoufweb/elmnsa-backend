const LiveSession = require('../models/LiveSession');

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
