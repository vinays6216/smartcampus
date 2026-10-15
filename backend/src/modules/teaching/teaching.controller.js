const { pool } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');
const { assertTeaches } = require('../../utils/ownership');

const SELECT = `
  SELECT ta.id, ta.lecturer_id, lu.full_name AS lecturer_name,
         ta.subject_id, sub.code AS subject_code, sub.name AS subject_name,
         ta.section_id, sec.name AS section_name, sec.semester_no,
         p.code AS program_code, ay.label AS academic_year,
         (SELECT COUNT(*) FROM students st WHERE st.section_id = ta.section_id AND st.status = 'active') AS student_count
    FROM teaching_assignments ta
    JOIN lecturers l   ON l.id = ta.lecturer_id
    JOIN users lu      ON lu.id = l.user_id
    JOIN subjects sub  ON sub.id = ta.subject_id
    JOIN sections sec  ON sec.id = ta.section_id
    JOIN programs p    ON p.id = sec.program_id
    JOIN academic_years ay ON ay.id = sec.academic_year_id`;

// Admin: all (with filters). Lecturer: only his own classes.
exports.list = asyncHandler(async (req, res) => {
  const where = ['1=1'];
  const params = [];
  if (req.user.role === 'lecturer') {
    where.push('ta.lecturer_id = ?');
    params.push(req.user.profileId);
  } else if (req.query.lecturerId) {
    where.push('ta.lecturer_id = ?');
    params.push(req.query.lecturerId);
  }
  if (req.query.sectionId) { where.push('ta.section_id = ?'); params.push(req.query.sectionId); }
  if (req.query.subjectId) { where.push('ta.subject_id = ?'); params.push(req.query.subjectId); }

  const [rows] = await pool.query(
    `${SELECT} WHERE ${where.join(' AND ')} ORDER BY ay.start_date DESC, p.code, sec.semester_no, sec.name, sub.code`,
    params
  );
  res.json({ success: true, data: rows });
});

exports.create = asyncHandler(async (req, res) => {
  const { lecturerId, subjectId, sectionId } = req.body;
  const [[subject]] = await pool.query('SELECT program_id, semester_no FROM subjects WHERE id = ?', [subjectId]);
  const [[section]] = await pool.query('SELECT program_id, semester_no FROM sections WHERE id = ?', [sectionId]);
  if (!subject || !section) throw new ApiError(400, 'Subject or section does not exist');
  if (subject.program_id !== section.program_id || subject.semester_no !== section.semester_no) {
    throw new ApiError(400, 'Subject and section must belong to the same program and semester');
  }
  const [r] = await pool.query(
    'INSERT INTO teaching_assignments (lecturer_id, subject_id, section_id) VALUES (?, ?, ?)',
    [lecturerId, subjectId, sectionId]
  );
  res.status(201).json({ success: true, data: { id: r.insertId } });
});

exports.remove = asyncHandler(async (req, res) => {
  const [r] = await pool.query('DELETE FROM teaching_assignments WHERE id = ?', [req.params.id]);
  if (!r.affectedRows) throw new ApiError(404, 'Teaching assignment not found');
  res.json({ success: true, message: 'Removed' });
});

// Students of the class (used by the lecturer's "mark attendance" screen).
// Optional ?date=YYYY-MM-DD&period=1 tells whether attendance was already taken.
exports.roster = asyncHandler(async (req, res) => {
  const taId = req.params.id;
  await assertTeaches(req.user, taId);
  const [students] = await pool.query(
    `SELECT s.id AS student_id, s.usn, u.full_name
       FROM students s
       JOIN users u ON u.id = s.user_id
       JOIN teaching_assignments ta ON ta.section_id = s.section_id
      WHERE ta.id = ? AND s.status = 'active'
      ORDER BY s.usn`,
    [taId]
  );
  let existingSessionId = null;
  if (req.query.date) {
    const [rows] = await pool.query(
      'SELECT id FROM attendance_sessions WHERE teaching_assignment_id = ? AND session_date = ? AND period_no = ?',
      [taId, req.query.date, req.query.period || 1]
    );
    existingSessionId = rows[0] ? rows[0].id : null;
  }
  res.json({ success: true, data: { students, existingSessionId } });
});
