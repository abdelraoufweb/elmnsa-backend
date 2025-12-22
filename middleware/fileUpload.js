// ==========================================
// FILE UPLOAD MIDDLEWARE
// ==========================================

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

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
    const allowed = ['.jpg', '.jpeg', '.png', '.gif'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid image format'), false);
    }
  },

  material: (req, file, cb) => {
    const allowed = ['.pdf', '.doc', '.docx', '.xlsx', '.xls', '.ppt', '.pptx', '.txt', '.jpg', '.png', '.mp4', '.webm'];
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

// Helper to get file URL
const getFileUrl = (category, filename) => {
  return `${process.env.SERVER_URL}/uploads/${category}/${filename}`;
};

// Helper to delete file
const deleteFile = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
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
  getFileUrl,
  deleteFile
};
