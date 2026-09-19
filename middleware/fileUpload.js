// ==========================================
// FILE UPLOAD MIDDLEWARE (R2 INTEGRATED)
// ==========================================

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { uploadFile, deleteFileFromR2 } = require('../services/s3Service');

// Ensure upload directory exists
const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Storage configuration for different file types
const storage = {
  homework: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(uploadDir, 'homework');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${uuidv4()}${ext}`);
    }
  }),

  worksheet: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(uploadDir, 'worksheets');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${uuidv4()}${ext}`);
    }
  }),

  profile: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(uploadDir, 'profiles');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${req.user._id}${ext}`);
    }
  }),

  material: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(uploadDir, 'materials');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${uuidv4()}${ext}`);
    }
  })
};

// File filters
const fileFilter = {
  homework: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.xlsx', '.xls', '.ppt', '.pptx', '.txt', '.jpg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type for homework'), false);
    }
  },

  worksheet: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.xlsx', '.xls', '.jpg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type for worksheet'), false);
    }
  },

  profile: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid image format. Allowed: jpg, png, webp, avif'), false);
    }
  },

  material: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.xlsx', '.xls', '.ppt', '.pptx', '.txt', '.jpg', '.png', '.webp', '.avif', '.mp4', '.webm'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type for material'), false);
    }
  }
};

// Multer instances
const uploadHomework = multer({
  storage: storage.homework,
  fileFilter: fileFilter.homework,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

const uploadWorksheet = multer({
  storage: storage.worksheet,
  fileFilter: fileFilter.worksheet,
  limits: { fileSize: 50 * 1024 * 1024 }
});

const uploadProfile = multer({
  storage: storage.profile,
  fileFilter: fileFilter.profile,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

const uploadMaterial = multer({
  storage: storage.material,
  fileFilter: fileFilter.material,
  limits: { fileSize: 500 * 1024 * 1024 } // 500MB
});

// Helper to get file URL (Supports Local & R2)
const getFileUrl = (category, filename, isR2 = false) => {
  if (isR2) {
    return `${process.env.R2_PUBLIC_URL}/${category}/${filename}`;
  }
  return `${process.env.SERVER_URL}/uploads/${category}/${filename}`;
};

// Helper for R2 Auto-Upload (Middleware Style)
const handleR2Upload = (category) => async (req, res, next) => {
  if (!req.file) return next();

  try {
    const publicUrl = await uploadFile(req.file, category);
    req.file.r2Url = publicUrl;
    next();
  } catch (error) {
    console.error('R2 Middleware Upload Error:', error);
    res.status(500).json({ success: false, message: 'Failed to upload to Cloud Storage' });
  }
};

// Helper to delete file (Handles both Local and R2)
const deleteFile = async (fileRef) => {
  try {
    if (!fileRef) return;

    // If it's a URL and contains R2 dev domain, delete from R2
    if (fileRef.includes('r2.dev') || fileRef.includes('cloudflarestorage.com')) {
      await deleteFileFromR2(fileRef);
      return true;
    }

    // Otherwise assume local path
    const absolutePath = path.isAbsolute(fileRef) ? fileRef : path.join(__dirname, '..', fileRef.replace(/^\//, ''));
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
      return true;
    }
  } catch (error) {
    console.error('Error deleting file:', error);
  }
  return false;
};

module.exports = {
  uploadHomework,
  uploadWorksheet,
  uploadProfile,
  uploadMaterial,
  handleR2Upload,
  getFileUrl,
  deleteFile
};
