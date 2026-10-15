const path = require('path');
const { pool, withTransaction } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');
const { buildUpdate } = require('../../utils/sql');
const { assertTeaches } = require('../../utils/ownership');
const { getStudent } = require('../../utils/profile');
const { saveFileRecord } = require('../../utils/files');
const { notifyUsers, sectionStudentUserIds } = require('../../utils/notify');

const TYPE_BY_EXT = { pdf: 'pdf', ppt: 'ppt', pptx: 'ppt', doc: 'doc', docx: 'doc' };

const SELECT = `
  SELECT sm.id, sm.title, sm.description, sm.unit_no, sm.material_type, sm.is_active, sm.created_at,
         sm.teaching_assignment_id, sm.file_id, f.original_name, f.extension, f.size_bytes,
         sub.id AS subject_id, sub.code AS subject_code, sub.name AS subject_name,
         sec.name AS section_name, u.full_name AS uploaded_by_name
    FROM study_materials sm
    JOIN teaching_assignments ta ON ta.id = sm.teaching_assignment_id
    JOIN subjects sub ON sub.id = ta.subject_id
    JOIN sections sec ON sec.id = ta.section_id
    JOIN lecturers l ON l.id = sm.uploaded_by
    JOIN users u ON u.id = l.user_id
    JOIN files f ON f.id = sm.file_id`;

// Student: active materials of own section. Lecturer: own uploads. Admin: everything.
exports.list = asyncHandler(async (req, res) => {
  const where = ['1=1'];
  const params = [];
  const { role, profileId } = req.user;

  if (role === 'student') {
    const student = await getStudent(profileId);
    where.push('ta.section_id = ?', 'sm.is_active = 1');
    params.push(student.section_id);
  } else if (role === 'lecturer') {
    where.push('ta.lecturer_id = ?');
    params.push(profileId);
  }
  const { teachingAssignmentId, subjectId, type, q } = req.query;
  if (teachingAssignmentId) { where.push('sm.teaching_assignment_id = ?'); params.push(teachingAssignmentId); }
  if (subjectId) { where.push('ta.subject_id = ?'); params.push(subjectId); }
  if (type) { where.push('sm.material_type = ?'); params.push(type); }
  if (q) { where.push('sm.title LIKE ?'); params.push(`%${q}%`); }

  const [rows] = await pool.query(
    `${SELECT} WHERE ${where.join(' AND ')} ORDER BY sub.code, sm.unit_no, sm.created_at DESC`,
    params
  );
  res.json({ success: true, data: rows });
});

// multipart/form-data: file + teachingAssignmentId + title (+ description, unitNo)
exports.upload = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'File is required (field name: file)');
  const b = req.body;
  await assertTeaches(req.user, b.teachingAssignmentId);

  const ext = path.extname(req.file.originalname).slice(1).toLowerCase();
  const id = await withTransaction(async (conn) => {
    const fileId = await saveFileRecord(conn, req.file, req.user.id);
    const [r] = await conn.query(
      `INSERT INTO study_materials (teaching_assignment_id, title, description, unit_no, material_type, file_id, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [b.teachingAssignmentId, b.title, b.description || null, b.unitNo || null, TYPE_BY_EXT[ext] || 'other', fileId, req.user.profileId]
    );
    const [[ta]] = await conn.query('SELECT section_id FROM teaching_assignments WHERE id = ?', [b.teachingAssignmentId]);
    await notifyUsers(conn, await sectionStudentUserIds(conn, ta.section_id), {
      type: 'material_uploaded', title: 'New study material', message: b.title, entityType: 'material', entityId: r.insertId,
    });
    return r.insertId;
  });
  res.status(201).json({ success: true, data: { id } });
});

exports.update = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT sm.id, ta.lecturer_id FROM study_materials sm JOIN teaching_assignments ta ON ta.id = sm.teaching_assignment_id WHERE sm.id = ?',
    [req.params.id]
  );
  if (!rows[0]) throw new ApiError(404, 'Material not found');
  if (req.user.role === 'lecturer' && rows[0].lecturer_id !== req.user.profileId) throw new ApiError(403, 'Not your material');

  const { sets, values } = buildUpdate(
    { title: 'title', description: 'description', unitNo: 'unit_no', isActive: 'is_active' }, req.body
  );
  if (!sets.length) throw new ApiError(400, 'Nothing to update');
  await pool.query(`UPDATE study_materials SET ${sets.join(', ')} WHERE id = ?`, [...values, req.params.id]);
  res.json({ success: true, message: 'Material updated' });
});

// "Delete" hides the material from students; the file and history are kept.
exports.hide = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    'SELECT sm.id, ta.lecturer_id FROM study_materials sm JOIN teaching_assignments ta ON ta.id = sm.teaching_assignment_id WHERE sm.id = ?',
    [req.params.id]
  );
  if (!rows[0]) throw new ApiError(404, 'Material not found');
  if (req.user.role === 'lecturer' && rows[0].lecturer_id !== req.user.profileId) throw new ApiError(403, 'Not your material');
  await pool.query('UPDATE study_materials SET is_active = 0 WHERE id = ?', [req.params.id]);
  res.json({ success: true, message: 'Material hidden from students' });
});
