const { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const path = require('path');
const fs = require('fs');

const s3Client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME;

/**
 * Upload a file to R2
 * @param {Object} file - Multer file object or object with path and originalname
 * @param {string} folder - Destination folder in bucket
 * @returns {Promise<string>} - The public URL of the uploaded file
 */
exports.uploadFile = async (file, folder = 'general') => {
    try {
        const fileStream = fs.createReadStream(file.path);
        const fileName = `${folder}/${Date.now()}-${file.originalname}`;

        const upload = new Upload({
            client: s3Client,
            params: {
                Bucket: BUCKET_NAME,
                Key: fileName,
                Body: fileStream,
                ContentType: file.mimetype,
            },
        });

        await upload.done();

        // Construct the public URL
        // Note: This assumes you have a public domain or custom domain set up for the bucket
        // If not, it will be the R2 internal URL which might not be accessible by students
        const publicUrl = `${process.env.R2_PUBLIC_URL}/${fileName}`;

        // Delete local file after upload
        if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
        }

        return publicUrl;
    } catch (error) {
        console.error('R2 Upload Error:', error);
        // Delete local file in case of upload failure to prevent leaks
        if (file && file.path && fs.existsSync(file.path)) {
            try {
                fs.unlinkSync(file.path);
                console.log(`🧹 Cleaned up local temp file after upload failure: ${file.path}`);
            } catch (unlinkErr) {
                console.error('Failed to delete local temp file after upload failure:', unlinkErr.message);
            }
        }
        throw new Error('Failed to upload file to storage');
    }
};

/**
 * Delete a file from R2
 * @param {string} fileUrl - Full URL of the file
 */
exports.deleteFileFromR2 = async (fileUrl) => {
    try {
        if (!fileUrl) return;

        // Extract key from URL
        const urlParts = fileUrl.split(process.env.R2_PUBLIC_URL);
        if (urlParts.length < 2) return;

        const key = urlParts[1].replace(/^\//, ''); // Remove leading slash

        const command = new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
        });

        await s3Client.send(command);
        console.log(`Successfully deleted ${key} from R2`);
    } catch (error) {
        console.error('R2 Delete Error:', error);
        // Don't throw error to avoid breaking the main flow
    }
};

/**
 * Delete older files (alternative to local cleanup)
 * This is more complex for R2, so we usually rely on DB references
 */
exports.deleteManyFromR2 = async (keys) => {
    if (!keys || keys.length === 0) return;

    for (const key of keys) {
        await exports.deleteFileFromR2(key);
    }
};
