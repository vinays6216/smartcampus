const fs = require('fs');
const path = require('path');
const env = require('../../config/env');
const { pool } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');
const canAccessFile = require('../../utils/fileAccess');

// GET /api/files/:id            -> download
// GET /api/files/:id?inline=1   -> open in the browser (PDF / image preview)
exports.download = asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM files WHERE id = ?', [req.params.id]);
  const file = rows[0];
  if (!file) throw new ApiError(404, 'File not found');
  if (!(await canAccessFile(req.user, file))) throw new ApiError(403, 'You do not have access to this file');

  const absolute = path.resolve(env.uploadDir, file.file_path);
  if (!absolute.startsWith(env.uploadDir + path.sep) || !fs.existsSync(absolute)) {
    throw new ApiError(404, 'File is missing on the server');
  }

  const disposition = req.query.inline === '1' ? 'inline' : 'attachment';
  res.setHeader('Content-Type', file.mime_type);
  res.setHeader('Content-Length', file.size_bytes);
  res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encodeURIComponent(file.original_name)}`);
  fs.createReadStream(absolute).pipe(res);
});
