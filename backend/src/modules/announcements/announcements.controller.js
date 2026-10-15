const { pool, withTransaction } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');
const paging = require('../../utils/paging');
const { buildUpdate, toSqlDateTime } = require('../../utils/sql');
const { assertTeachesSection } = require('../../utils/ownership');
const { getStudent } = require('../../utils/profile');
const { notifyUsers, audienceUserIds } = require('../../utils/notify');

const SELECT = `
  SELECT a.id, a.title, a.body, a.audience_type, a.department_id, a.section_id, a.priority,
         a.is_published, a.publish_at, a.expires_at, a.created_at, a.author_user_id,
         au.full_name AS author_name, au.role AS author_role,
         ce.id AS event_id, ce.event_type, ce.event_date, ce.start_time, ce.end_time, ce.location
    FROM announcements a
    JOIN users au ON au.id = a.author_user_id
    LEFT JOIN calendar_events ce ON ce.announcement_id = a.id`;

const VISIBLE_NOW = "a.is_published = 1 AND a.publish_at <= NOW() AND (a.expires_at IS NULL OR a.expires_at > NOW())";

// Feed: each role only gets announcements meant for it.
exports.list = asyncHandler(async (req, res) => {
  const { role, profileId, id: userId } = req.user;
  const { page, limit, offset } = paging(req.query);
  let where;
  let params = [];

  if (role === 'student') {
    const s = await getStudent(profileId);
    where = `${VISIBLE_NOW} AND (a.audience_type IN ('all','students')
               OR (a.audience_type = 'section' AND a.section_id = ?)
               OR (a.audience_type = 'department' AND a.department_id = ?))`;
    params = [s.section_id, s.department_id];
  } else if (role === 'lecturer') {
    where = `(${VISIBLE_NOW} AND (a.audience_type IN ('all','lecturers')
               OR (a.audience_type = 'department' AND a.department_id = (SELECT department_id FROM lecturers WHERE id = ?))
               OR (a.audience_type = 'section' AND a.section_id IN (SELECT section_id FROM teaching_assignments WHERE lecturer_id = ?))))
             OR a.author_user_id = ?`;
    params = [profileId, profileId, userId];
  } else {
    where = '1=1';
  }

  const [rows] = await pool.query(
    `${SELECT} WHERE ${where} ORDER BY FIELD(a.priority, 'urgent', 'important', 'normal'), a.publish_at DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  res.json({ success: true, data: rows, pagination: { page, limit } });
});

// Create an announcement (and optionally a calendar entry for an extra / special class in the same request).
exports.create = asyncHandler(async (req, res) => {
  const b = req.body;
  const isLecturer = req.user.role === 'lecturer';

  // Lecturers may only address a section they teach. Admin can address anybody.
  if (isLecturer) {
    if (b.audienceType !== 'section' || !b.sectionId) throw new ApiError(400, 'Lecturers can announce only to a section they teach');
    await assertTeachesSection(req.user, b.sectionId);
  }
  if (b.audienceType === 'section' && !b.sectionId) throw new ApiError(400, 'sectionId is required for a section announcement');
  if (b.audienceType === 'department' && !b.departmentId) throw new ApiError(400, 'departmentId is required for a department announcement');

  const publishAt = b.publishAt ? toSqlDateTime(b.publishAt) : null;
  const expiresAt = b.expiresAt ? toSqlDateTime(b.expiresAt) : null;

  const id = await withTransaction(async (conn) => {
    const [r] = await conn.query(
      `INSERT INTO announcements (title, body, author_user_id, audience_type, department_id, section_id, priority, publish_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()), ?)`,
      [b.title, b.body, req.user.id, b.audienceType, b.audienceType === 'department' ? b.departmentId : null,
       b.audienceType === 'section' ? b.sectionId : null, b.priority, publishAt, expiresAt]
    );

    if (b.event) {
      await conn.query(
        `INSERT INTO calendar_events (announcement_id, title, description, event_type, event_date, start_time, end_time, location, section_id, subject_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [r.insertId, b.event.title || b.title, b.body.slice(0, 500), b.event.eventType, b.event.eventDate,
         b.event.startTime || null, b.event.endTime || null, b.event.location || null,
         b.audienceType === 'section' ? b.sectionId : null, b.event.subjectId || null, req.user.id]
      );
    }

    // Notify now unless the announcement is scheduled for later
    if (!publishAt || new Date(b.publishAt) <= new Date()) {
      const userIds = await audienceUserIds(conn, b);
      await notifyUsers(conn, userIds.filter((u) => u !== req.user.id), {
        type: b.event ? 'calendar_event' : 'announcement',
        title: b.title, message: b.body.slice(0, 200), entityType: 'announcement', entityId: r.insertId,
      });
    }
    return r.insertId;
  });
  res.status(201).json({ success: true, data: { id } });
});

async function loadOwned(user, announcementId) {
  const [rows] = await pool.query('SELECT id, author_user_id FROM announcements WHERE id = ?', [announcementId]);
  if (!rows[0]) throw new ApiError(404, 'Announcement not found');
  if (user.role !== 'admin' && rows[0].author_user_id !== user.id) throw new ApiError(403, 'You can change only your own announcements');
  return rows[0];
}

exports.update = asyncHandler(async (req, res) => {
  await loadOwned(req.user, req.params.id);
  const body = { ...req.body };
  if (body.expiresAt) body.expiresAt = toSqlDateTime(body.expiresAt);
  const { sets, values } = buildUpdate(
    { title: 'title', body: 'body', priority: 'priority', expiresAt: 'expires_at', isPublished: 'is_published' }, body
  );
  if (!sets.length) throw new ApiError(400, 'Nothing to update');
  await pool.query(`UPDATE announcements SET ${sets.join(', ')} WHERE id = ?`, [...values, req.params.id]);
  res.json({ success: true, message: 'Announcement updated' });
});

exports.remove = asyncHandler(async (req, res) => {
  await loadOwned(req.user, req.params.id);
  await pool.query('DELETE FROM announcements WHERE id = ?', [req.params.id]); // linked calendar events go with it
  res.json({ success: true, message: 'Announcement deleted' });
});
