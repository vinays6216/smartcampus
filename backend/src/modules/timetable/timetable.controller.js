const { pool, withTransaction } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');
const { getStudent } = require('../../utils/profile');
const { saveFileRecord } = require('../../utils/files');
const { notifyUsers, sectionStudentUserIds, sectionLecturerUserIds } = require('../../utils/notify');

const SELECT = `
  SELECT t.id, t.section_id, t.title, t.effective_from, t.effective_to, t.is_active, t.created_at,
         t.file_id, f.original_name, f.extension, f.size_bytes,
         sec.name AS section_name, sec.semester_no, p.code AS program_code
    FROM timetables t
    JOIN files f ON f.id = t.file_id
    JOIN sections sec ON sec.id = t.section_id
    JOIN programs p ON p.id = sec.program_id`;

// Student: active timetable of own section. Lecturer: sections he teaches. Admin: anything (filter by sectionId).
exports.list = asyncHandler(async (req, res) => {
  const where = ['1=1'];
  const params = [];
  const { role, profileId } = req.user;

  if (role === 'student') {
    const student = await getStudent(profileId);
    where.push('t.section_id = ?', 't.is_active = 1');
    params.push(student.section_id);
  } else if (role === 'lecturer') {
    where.push('t.section_id IN (SELECT section_id FROM teaching_assignments WHERE lecturer_id = ?)', 't.is_active = 1');
    params.push(profileId);
  } else {
    if (req.query.sectionId) { where.push('t.section_id = ?'); params.push(req.query.sectionId); }
    if (req.query.activeOnly === 'true') where.push('t.is_active = 1');
  }
  const [rows] = await pool.query(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY t.created_at DESC`, params);
  res.json({ success: true, data: rows });
});

exports.upload = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Timetable file is required (field name: file)');
  const { sectionId, title, effectiveFrom, effectiveTo } = req.body;

  const id = await withTransaction(async (conn) => {
    const [[section]] = await conn.query('SELECT id FROM sections WHERE id = ?', [sectionId]);
    if (!section) throw new ApiError(400, 'Section does not exist');

    const fileId = await saveFileRecord(conn, req.file, req.user.id);
    await conn.query('UPDATE timetables SET is_active = 0 WHERE section_id = ? AND is_active = 1', [sectionId]);
    const [r] = await conn.query(
      'INSERT INTO timetables (section_id, title, file_id, effective_from, effective_to, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)',
      [sectionId, title, fileId, effectiveFrom, effectiveTo || null, req.user.id]
    );

    const userIds = [...(await sectionStudentUserIds(conn, sectionId)), ...(await sectionLecturerUserIds(conn, sectionId))];
    await notifyUsers(conn, userIds, {
      type: 'timetable_updated', title: 'Timetable updated', message: title, entityType: 'timetable', entityId: r.insertId,
    });
    return r.insertId;
  });
  res.status(201).json({ success: true, data: { id } });
});

exports.deactivate = asyncHandler(async (req, res) => {
  const [r] = await pool.query('UPDATE timetables SET is_active = 0 WHERE id = ?', [req.params.id]);
  if (!r.affectedRows) throw new ApiError(404, 'Timetable not found');
  res.json({ success: true, message: 'Timetable deactivated' });
});
