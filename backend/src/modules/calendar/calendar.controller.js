const { pool, withTransaction } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');
const { assertTeachesSection } = require('../../utils/ownership');
const { getStudent } = require('../../utils/profile');
const { notifyUsers, sectionStudentUserIds, sectionLecturerUserIds } = require('../../utils/notify');

// Events between ?from and ?to (default: this month). Student sees campus-wide + own section.
exports.list = asyncHandler(async (req, res) => {
  const now = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const from = req.query.from || `${now.getFullYear()}-${p(now.getMonth() + 1)}-01`;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const to = req.query.to || `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(lastDay)}`;

  const where = ['ce.event_date BETWEEN ? AND ?'];
  const params = [from, to];
  if (req.user.role === 'student') {
    const s = await getStudent(req.user.profileId);
    where.push('(ce.section_id IS NULL OR ce.section_id = ?)');
    params.push(s.section_id);
  } else if (req.user.role === 'lecturer') {
    where.push('(ce.section_id IS NULL OR ce.created_by = ? OR ce.section_id IN (SELECT section_id FROM teaching_assignments WHERE lecturer_id = ?))');
    params.push(req.user.id, req.user.profileId);
  }

  const [rows] = await pool.query(
    `SELECT ce.id, ce.announcement_id, ce.title, ce.description, ce.event_type, ce.event_date, ce.start_time, ce.end_time,
            ce.location, ce.section_id, sec.name AS section_name, ce.subject_id, sub.name AS subject_name
       FROM calendar_events ce
       LEFT JOIN sections sec ON sec.id = ce.section_id
       LEFT JOIN subjects sub ON sub.id = ce.subject_id
      WHERE ${where.join(' AND ')}
      ORDER BY ce.event_date, ce.start_time`,
    params
  );
  res.json({ success: true, data: rows });
});

// Stand-alone event (without an announcement). sectionId empty = whole campus (admin only).
exports.create = asyncHandler(async (req, res) => {
  const b = req.body;
  if (req.user.role === 'lecturer') {
    if (!b.sectionId) throw new ApiError(400, 'Lecturers must choose a section');
    await assertTeachesSection(req.user, b.sectionId);
  }
  const id = await withTransaction(async (conn) => {
    const [r] = await conn.query(
      `INSERT INTO calendar_events (title, description, event_type, event_date, start_time, end_time, location, section_id, subject_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [b.title, b.description || null, b.eventType, b.eventDate, b.startTime || null, b.endTime || null,
       b.location || null, b.sectionId || null, b.subjectId || null, req.user.id]
    );
    if (b.sectionId) {
      const userIds = [...(await sectionStudentUserIds(conn, b.sectionId)), ...(await sectionLecturerUserIds(conn, b.sectionId))];
      await notifyUsers(conn, userIds.filter((u) => u !== req.user.id), {
        type: 'calendar_event', title: b.title, message: `${b.eventDate}${b.startTime ? ` at ${b.startTime}` : ''}`,
        entityType: 'calendar_event', entityId: r.insertId,
      });
    }
    return r.insertId;
  });
  res.status(201).json({ success: true, data: { id } });
});

exports.remove = asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT id, created_by FROM calendar_events WHERE id = ?', [req.params.id]);
  if (!rows[0]) throw new ApiError(404, 'Event not found');
  if (req.user.role !== 'admin' && rows[0].created_by !== req.user.id) throw new ApiError(403, 'You can delete only your own events');
  await pool.query('DELETE FROM calendar_events WHERE id = ?', [req.params.id]);
  res.json({ success: true, message: 'Event deleted' });
});
