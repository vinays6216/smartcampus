const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const env = require('../../config/env');
const { pool, withTransaction } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');
const paging = require('../../utils/paging');
const { buildUpdate } = require('../../utils/sql');
const { audit } = require('../../utils/audit');

const tempPassword = () => crypto.randomBytes(6).toString('base64url');

const USER_MAP = { fullName: 'full_name', phone: 'phone', email: 'email' };
const STUDENT_MAP = {
  usn: 'usn', programId: 'program_id', sectionId: 'section_id', admissionYear: 'admission_year',
  dateOfBirth: 'date_of_birth', gender: 'gender', address: 'address',
  guardianName: 'guardian_name', guardianPhone: 'guardian_phone',
};
const LECTURER_MAP = {
  employeeCode: 'employee_code', departmentId: 'department_id', designation: 'designation',
  qualification: 'qualification', joinedOn: 'joined_on',
};
const STUDENT_STATUS_TO_USER = { active: 'active', suspended: 'suspended', dropped: 'inactive', passed_out: 'inactive' };

async function assertSectionInProgram(conn, sectionId, programId) {
  const [rows] = await conn.query('SELECT program_id FROM sections WHERE id = ?', [sectionId]);
  if (!rows[0]) throw new ApiError(400, 'Section does not exist');
  if (rows[0].program_id !== programId) throw new ApiError(400, 'Section does not belong to the selected program');
}

async function updateRow(conn, table, map, body, where, whereValue) {
  const { sets, values } = buildUpdate(map, body);
  if (sets.length) await conn.query(`UPDATE ${table} SET ${sets.join(', ')} WHERE ${where} = ?`, [...values, whereValue]);
}

// ======================= STUDENTS =======================

exports.listStudents = asyncHandler(async (req, res) => {
  const { q, programId, sectionId, status } = req.query;
  const { page, limit, offset } = paging(req.query);
  const where = ['1=1'];
  const params = [];
  if (q) { where.push('(u.full_name LIKE ? OR s.usn LIKE ? OR u.email LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (programId) { where.push('s.program_id = ?'); params.push(programId); }
  if (sectionId) { where.push('s.section_id = ?'); params.push(sectionId); }
  if (status) { where.push('s.status = ?'); params.push(status); }

  const base = `FROM students s
    JOIN users u ON u.id = s.user_id
    JOIN programs p ON p.id = s.program_id
    JOIN sections sec ON sec.id = s.section_id
    WHERE ${where.join(' AND ')}`;
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${base}`, params);
  const [rows] = await pool.query(
    `SELECT s.id, s.user_id, s.usn, s.status, u.full_name, u.email, u.phone,
            p.code AS program_code, sec.id AS section_id, sec.name AS section_name, sec.semester_no
     ${base} ORDER BY s.usn LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  res.json({ success: true, data: rows, pagination: { page, limit, total } });
});

exports.getStudent = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT s.*, u.full_name, u.email, u.phone, u.status AS account_status, u.last_login_at,
            p.code AS program_code, sec.name AS section_name, sec.semester_no
       FROM students s JOIN users u ON u.id = s.user_id
       JOIN programs p ON p.id = s.program_id JOIN sections sec ON sec.id = s.section_id
      WHERE s.id = ?`,
    [req.params.id]
  );
  if (!rows[0]) throw new ApiError(404, 'Student not found');
  res.json({ success: true, data: rows[0] });
});

exports.createStudent = asyncHandler(async (req, res) => {
  const b = req.body;
  const password = b.password || tempPassword();
  const hash = await bcrypt.hash(password, env.bcryptRounds);

  const id = await withTransaction(async (conn) => {
    await assertSectionInProgram(conn, b.sectionId, b.programId);
    const [u] = await conn.query(
      "INSERT INTO users (email, password_hash, role, full_name, phone) VALUES (?, ?, 'student', ?, ?)",
      [b.email, hash, b.fullName, b.phone || null]
    );
    const [s] = await conn.query(
      `INSERT INTO students (user_id, usn, program_id, section_id, admission_year, date_of_birth, gender, address, guardian_name, guardian_phone)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [u.insertId, b.usn, b.programId, b.sectionId, b.admissionYear || null, b.dateOfBirth || null,
       b.gender || null, b.address || null, b.guardianName || null, b.guardianPhone || null]
    );
    return s.insertId;
  });
  await audit(req, 'STUDENT_CREATED', 'student', id, null, { usn: b.usn, email: b.email });
  res.status(201).json({ success: true, data: { id, temporaryPassword: password } });
});

exports.updateStudent = asyncHandler(async (req, res) => {
  const id = req.params.id;
  const [rows] = await pool.query('SELECT user_id, program_id, section_id, usn FROM students WHERE id = ?', [id]);
  if (!rows[0]) throw new ApiError(404, 'Student not found');
  const before = rows[0];

  await withTransaction(async (conn) => {
    const programId = req.body.programId || before.program_id;
    const sectionId = req.body.sectionId || before.section_id;
    if (req.body.programId || req.body.sectionId) await assertSectionInProgram(conn, sectionId, programId);
    await updateRow(conn, 'users', USER_MAP, req.body, 'id', before.user_id);
    await updateRow(conn, 'students', STUDENT_MAP, req.body, 'id', id);
  });
  await audit(req, 'STUDENT_UPDATED', 'student', Number(id), before, req.body);
  res.json({ success: true, message: 'Student updated' });
});

exports.updateStudentStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const [rows] = await pool.query('SELECT user_id, status FROM students WHERE id = ?', [req.params.id]);
  if (!rows[0]) throw new ApiError(404, 'Student not found');
  await withTransaction(async (conn) => {
    await conn.query('UPDATE students SET status = ? WHERE id = ?', [status, req.params.id]);
    await conn.query('UPDATE users SET status = ? WHERE id = ?', [STUDENT_STATUS_TO_USER[status], rows[0].user_id]);
  });
  await audit(req, 'STUDENT_STATUS_CHANGED', 'student', Number(req.params.id), { status: rows[0].status }, { status });
  res.json({ success: true, message: 'Student status updated' });
});

// ======================= LECTURERS =======================

exports.listLecturers = asyncHandler(async (req, res) => {
  const { q, departmentId, status } = req.query;
  const { page, limit, offset } = paging(req.query);
  const where = ['1=1'];
  const params = [];
  if (q) { where.push('(u.full_name LIKE ? OR l.employee_code LIKE ? OR u.email LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (departmentId) { where.push('l.department_id = ?'); params.push(departmentId); }
  if (status) { where.push('u.status = ?'); params.push(status); }

  const base = `FROM lecturers l JOIN users u ON u.id = l.user_id JOIN departments d ON d.id = l.department_id WHERE ${where.join(' AND ')}`;
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${base}`, params);
  const [rows] = await pool.query(
    `SELECT l.id, l.user_id, l.employee_code, l.designation, u.full_name, u.email, u.phone, u.status,
            d.id AS department_id, d.name AS department_name
     ${base} ORDER BY u.full_name LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  res.json({ success: true, data: rows, pagination: { page, limit, total } });
});

exports.getLecturer = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT l.*, u.full_name, u.email, u.phone, u.status, u.last_login_at, d.name AS department_name
       FROM lecturers l JOIN users u ON u.id = l.user_id JOIN departments d ON d.id = l.department_id
      WHERE l.id = ?`,
    [req.params.id]
  );
  if (!rows[0]) throw new ApiError(404, 'Lecturer not found');
  const [classes] = await pool.query(
    `SELECT ta.id AS teaching_assignment_id, sub.code AS subject_code, sub.name AS subject_name, sec.name AS section_name, sec.semester_no
       FROM teaching_assignments ta JOIN subjects sub ON sub.id = ta.subject_id JOIN sections sec ON sec.id = ta.section_id
      WHERE ta.lecturer_id = ?`,
    [req.params.id]
  );
  res.json({ success: true, data: { ...rows[0], classes } });
});

exports.createLecturer = asyncHandler(async (req, res) => {
  const b = req.body;
  const password = b.password || tempPassword();
  const hash = await bcrypt.hash(password, env.bcryptRounds);

  const id = await withTransaction(async (conn) => {
    const [u] = await conn.query(
      "INSERT INTO users (email, password_hash, role, full_name, phone) VALUES (?, ?, 'lecturer', ?, ?)",
      [b.email, hash, b.fullName, b.phone || null]
    );
    const [l] = await conn.query(
      'INSERT INTO lecturers (user_id, employee_code, department_id, designation, qualification, joined_on) VALUES (?, ?, ?, ?, ?, ?)',
      [u.insertId, b.employeeCode, b.departmentId, b.designation || null, b.qualification || null, b.joinedOn || null]
    );
    return l.insertId;
  });
  await audit(req, 'LECTURER_CREATED', 'lecturer', id, null, { employeeCode: b.employeeCode, email: b.email });
  res.status(201).json({ success: true, data: { id, temporaryPassword: password } });
});

exports.updateLecturer = asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT user_id, department_id, employee_code FROM lecturers WHERE id = ?', [req.params.id]);
  if (!rows[0]) throw new ApiError(404, 'Lecturer not found');
  await withTransaction(async (conn) => {
    await updateRow(conn, 'users', USER_MAP, req.body, 'id', rows[0].user_id);
    await updateRow(conn, 'lecturers', LECTURER_MAP, req.body, 'id', req.params.id);
  });
  await audit(req, 'LECTURER_UPDATED', 'lecturer', Number(req.params.id), rows[0], req.body);
  res.json({ success: true, message: 'Lecturer updated' });
});

exports.updateLecturerStatus = asyncHandler(async (req, res) => {
  const [rows] = await pool.query('SELECT user_id FROM lecturers WHERE id = ?', [req.params.id]);
  if (!rows[0]) throw new ApiError(404, 'Lecturer not found');
  await pool.query('UPDATE users SET status = ? WHERE id = ?', [req.body.status, rows[0].user_id]);
  await audit(req, 'LECTURER_STATUS_CHANGED', 'lecturer', Number(req.params.id), null, { status: req.body.status });
  res.json({ success: true, message: 'Lecturer status updated' });
});

// ======================= PASSWORD RESET BY ADMIN =======================

exports.resetUserPassword = asyncHandler(async (req, res) => {
  const password = tempPassword();
  const hash = await bcrypt.hash(password, env.bcryptRounds);
  const [r] = await pool.query('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?', [hash, req.params.userId]);
  if (!r.affectedRows) throw new ApiError(404, 'User not found');
  await audit(req, 'PASSWORD_RESET_BY_ADMIN', 'user', Number(req.params.userId));
  res.json({ success: true, data: { temporaryPassword: password } });
});

// ======================= DASHBOARD COUNTS =======================

exports.counts = asyncHandler(async (req, res) => {
  const [[row]] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM students WHERE status = 'active') AS active_students,
       (SELECT COUNT(*) FROM lecturers l JOIN users u ON u.id = l.user_id WHERE u.status = 'active') AS active_lecturers,
       (SELECT COUNT(*) FROM sections) AS sections,
       (SELECT COUNT(*) FROM assignments WHERE status = 'published') AS published_assignments,
       (SELECT COUNT(*) FROM attendance_issues WHERE status = 'open') AS open_attendance_issues`
  );
  res.json({ success: true, data: row });
});
