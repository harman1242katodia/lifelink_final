const multer = require('multer');
const path = require('path');
const fs = require('fs');


const uploadDir = path.join(__dirname, '..', 'uploads', 'profiles');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}


const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB


const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const userId = req.user && req.user._id ? req.user._id.toString() : 'guest';
    const role = req.user && req.user.role ? req.user.role : 'user';
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${role}-${userId}-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype.toLowerCase();

  const isExtValid = ALLOWED_EXTENSIONS.includes(ext);
  const isMimeValid = ALLOWED_MIME_TYPES.includes(mime);

  if (isExtValid && isMimeValid) {
    return cb(null, true);
  }

  const error = new Error('Invalid file format. Only JPG, JPEG, PNG, and WEBP images are allowed.');
  error.code = 'INVALID_FILE_TYPE';
  return cb(error, false);
};


const upload = multer({
  storage: storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES
  },
  fileFilter: fileFilter
});

/**
 * Middleware wrapper for single profile picture upload with user-friendly error handling
 */
function handleProfileUpload(req, res, next) {
  const uploadSingle = upload.single('profilePicture');

  uploadSingle(req, res, function (err) {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          error: 'FILE_TOO_LARGE',
          message: 'The uploaded image exceeds the maximum permitted size of 2 MB.'
        });
      }
      return res.status(400).json({
        success: false,
        error: err.code,
        message: `Upload error: ${err.message}`
      });
    } else if (err) {
      return res.status(400).json({
        success: false,
        error: err.code || 'INVALID_UPLOAD',
        message: err.message || 'File upload failed validation.'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'NO_FILE',
        message: 'Please choose an image file (JPG, PNG, or WEBP under 2 MB) to upload.'
      });
    }

    next();
  });
}

/**
 * Safely removes a previous profile picture file from disk
 * @param {string} picturePath 
 */
function deletePreviousProfilePicture(picturePath) {
  if (!picturePath || typeof picturePath !== 'string') return;
  try {
    const filename = path.basename(picturePath);
    const fullPath = path.join(uploadDir, filename);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
      console.log(`[LifeLink Upload] Safely removed previous profile picture: ${filename}`);
    }
  } catch (err) {
    console.warn(`[LifeLink Upload] Could not remove previous profile picture:`, err.message);
  }
}

/**
 * Cleans up a newly uploaded file if database persistence fails
 * @param {string} filePath Full path to the newly saved file
 */
function cleanupNewFile(filePath) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[LifeLink Upload] Cleaned up temporary upload after failure: ${filePath}`);
    }
  } catch (err) {
    console.warn(`[LifeLink Upload] Cleanup error:`, err.message);
  }
}

module.exports = {
  handleProfileUpload,
  deletePreviousProfilePicture,
  cleanupNewFile,
  uploadDir
};
