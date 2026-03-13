const fs = require('fs');
const path = require('path');
const Message = require('../models/Message');
const Homework = require('../models/Homework');
const { deleteFile } = require('../middleware/fileUpload');

// Run cleanup every 12 hours
const CLEANUP_INTERVAL = 12 * 60 * 60 * 1000;

const cleanupOldData = async () => {
    try {
        console.log('🧹 [Cleanup Service] Starting periodic cleanup for space management...');

        const now = new Date();

        // ==========================================
        // 1. CHATS CLEANUP (OLDER THAN 2 DAYS)
        // ==========================================
        const twoDaysAgo = new Date(now.getTime() - (2 * 24 * 60 * 60 * 1000));

        // Find messages with attached files
        const oldMessagesWithFiles = await Message.find({
            createdAt: { $lt: twoDaysAgo },
            'file.url': { $exists: true }
        });

        for (const msg of oldMessagesWithFiles) {
            try {
                if (msg.file && msg.file.url) {
                    await deleteFile(msg.file.url);
                }
            } catch (err) {
                console.error(`Error deleting chat file for ID ${msg._id}:`, err.message);
            }
        }

        const msgResult = await Message.deleteMany({
            createdAt: { $lt: twoDaysAgo }
        });

        // ==========================================
        // 2. HOMEWORKS CLEANUP (OLDER THAN 7 DAYS)
        // ==========================================
        const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
        const oldHomeworks = await Homework.find({
            createdAt: { $lt: sevenDaysAgo }
        });

        for (const hw of oldHomeworks) {
            try {
                if (hw.fileUrl) {
                    await deleteFile(hw.fileUrl);
                }

                if (hw.correctedFileUrl) {
                    await deleteFile(hw.correctedFileUrl);
                }
            } catch (err) {
                console.error(`Error deleting homework file for ID ${hw._id}:`, err.message);
            }
        }

        const hwResult = await Homework.deleteMany({
            createdAt: { $lt: sevenDaysAgo }
        });

        console.log(`✅ [Cleanup Summary] Deleted ${msgResult.deletedCount || 0} old messages and ${hwResult.deletedCount || 0} old homeworks/files from storage.`);

    } catch (e) {
        console.error('❌ [Cleanup Service] Error during cleanup:', e);
    }
};

const startCleanupService = () => {
    // Run immediately after 15 seconds of startup
    setTimeout(cleanupOldData, 15000);

    // Run periodically
    setInterval(cleanupOldData, CLEANUP_INTERVAL);
};

module.exports = { startCleanupService };
