const path = require('path');
const env = require('../config/env');

// Saves one row in `files` for a file multer already stored on disk. Returns files.id
exports.saveFileRecord = async (conn, file, userId) => {
  const relativePath = path.relative(env.uploadDir, file.path).split(path.sep).join('/');
  const [result] = await conn.query(
    `INSERT INTO files (original_name, stored_name, file_path, extension, mime_type, size_bytes, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      file.originalname,
      file.filename,
      relativePath,
      path.extname(file.originalname).slice(1).toLowerCase(),
      file.mimetype,
      file.size,
      userId,
    ]
  );
  return result.insertId;
};
