const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

function makeUpload(category, allowedExt, maxMB) {
  const dir = path.join(env.uploadDir, category);
  fs.mkdirSync(dir, { recursive: true });

  const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, dir),
    filename: (req, file, cb) =>
      cb(null, crypto.randomUUID() + path.extname(file.originalname).toLowerCase()),
  });

  return multer({
    storage,
    limits: { fileSize: maxMB * 1024 * 1024, files: 5 },
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname).slice(1).toLowerCase();
      if (!allowedExt.includes(ext)) {
        return cb(new ApiError(400, `Only ${allowedExt.join(', ')} files are allowed`));
      }
      cb(null, true);
    },
  });
}

module.exports = {
  timetable: makeUpload('timetables', ['pdf', 'png', 'jpg', 'jpeg'], 10),
  material: makeUpload('materials', ['pdf', 'ppt', 'pptx', 'doc', 'docx'], 25),
  assignment: makeUpload('assignments', ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'zip'], 15),
  submission: makeUpload('submissions', ['pdf'], 15),
  proof: makeUpload('proofs', ['pdf', 'png', 'jpg', 'jpeg'], 5),
};
