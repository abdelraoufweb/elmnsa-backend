const fs = require('fs');

/**
 * Validate file content using Magic Bytes
 * @param {string} filePath - Path to file
 * @param {string} claimedMime - MIME type claimed by client
 * @returns {Promise<boolean>} - True if valid, False if invalid
 */
exports.validateFileContent = async (filePath, claimedMime) => {
    try {
        const buffer = Buffer.alloc(8); // Read first 8 bytes
        const fd = fs.openSync(filePath, 'r');
        fs.readSync(fd, buffer, 0, 8, 0);
        fs.closeSync(fd);

        const hex = buffer.toString('hex').toUpperCase();

        // Signatures
        const signatures = {
            'application/pdf': ['25504446'], // %PDF
            'image/jpeg': ['FFD8FF'],
            'image/png': ['89504E470D0A1A0A'],
            'image/gif': ['47494638'], // GIF8
            'video/mp4': ['66747970', '000000'], // ftyp or check bytes 4-8 usually
            // MS Office (Docx/Xlsx/Pptx) - PK..
            'application/vnd.openxmlformats-officedocument': ['504B0304'],
            'application/zip': ['504B0304']
        };

        // Generic PDF check
        if (claimedMime === 'application/pdf' && hex.startsWith('25504446')) return true;

        // Generic Image check
        if (claimedMime === 'image/jpeg' && hex.startsWith('FFD8FF')) return true;
        if (claimedMime === 'image/png' && hex.startsWith('89504E47')) return true;

        // MP4 is tricky (ftyp is at offset 4 usually)
        if (claimedMime === 'video/mp4') {
            // Check for 'ftyp' at offset 4
            const subtype = buffer.slice(4, 8).toString('ascii');
            // Common mp4 signatures often contain ftyp
            if (subtype === 'ftyp') return true;
            // Or starts with 00 00 00 ... ftyp
            if (hex.startsWith('000000')) return true; // Weak check but common
        }

        // Office check
        if (claimedMime.includes('openxmlformats') || claimedMime === 'application/zip') {
            if (hex.startsWith('504B0304')) return true;
        }

        // If we don't know the sig, we fail open? Or fail closed?
        // Secure approach: Fail closed for critical types.
        // For now, let's just log and return false if specific types match.

        return false;
    } catch (error) {
        console.error('Magic byte check failed:', error);
        return false;
    }
};
