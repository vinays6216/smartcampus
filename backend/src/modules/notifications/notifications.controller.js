const { pool } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');
const paging = require('../../utils/paging');

exports.list = asyncHandler(async (req, res) => {
  const { page, limit, offset } = paging(req.query);
  const where = ['user_id = ?'];
  const params = [req.user.id];
  if (req.query.unread === 'true') where.push('is_read = 0');

  const [rows] = await pool.query(
    `SELECT id, type, title, message, entity_type, entity_id, is_read, created_at, read_at
       FROM notifications WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  res.json({ success: true, data: rows, pagination: { page, limit } });
});

exports.unreadCount = asyncHandler(async (req, res) => {
  const [[row]] = await pool.query('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0', [req.user.id]);
  res.json({ success: true, data: { count: row.count } });
});

exports.markRead = asyncHandler(async (req, res) => {
  const [r] = await pool.query(
    'UPDATE notifications SET is_read = 1, read_at = NOW() WHERE id = ? AND user_id = ?',
    [req.params.id, req.user.id]
  );
  if (!r.affectedRows) throw new ApiError(404, 'Notification not found');
  res.json({ success: true });
});

exports.markAllRead = asyncHandler(async (req, res) => {
  await pool.query('UPDATE notifications SET is_read = 1, read_at = NOW() WHERE user_id = ? AND is_read = 0', [req.user.id]);
  res.json({ success: true });
});
