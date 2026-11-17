const { pool, withTransaction } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');
const { assertTeaches } = require('../../utils/ownership');
const { notifyUsers } = require('../../utils/notify');
const { audit } = require('../../utils/audit');

// Internal marks (tables assessments + assessment_marks, database/migrations/004_internal_marks.sql).

const needsMigration = (fn) => asyncHandler(async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (e) {
    if (e && e.code === 'ER_NO_SUCH_TABLE') throw new ApiError(503, 'Internal marks are not set up yet: run database/migrations/004_internal_marks.sql');
    throw e;
  }
});

const pct = (got, max) => (max > 0 ? Math.round((got / max) * 10000) / 100 : null);

async function getAssessment(id, user) {
  const [[a]] = await pool.query(
    `SELECT a.*, ta.section_id, sub.code AS subject_code, sub.name AS subject_name, sec.name AS section_name
       FROM assessments a
       JOIN teaching_assignments ta ON ta.id = a.teaching_assignment_id
       JOIN subjects sub ON sub.id = ta.subject_id
       JOIN sections sec ON sec.id = ta.section_id
      WHERE a.id = ?`,
    [id]
  );
  if (!a) throw new ApiError(404, 'Assessment not found');
  await assertTeaches(user, a.teaching_assignment_id);
  return a;
}

// Students of the class: active ones in the section + anybody who already has marks.
async function roster(conn, assessment) {
  const [rows] = await conn.query(
    `SELECT s.id AS student_id, s.usn, u.full_name, m.marks, m.is_absent, m.remarks
       FROM students s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN assessment_marks m ON m.assessment_id = ? AND m.student_id = s.id
      WHERE (s.section_id = ? AND s.status = 'active') OR m.student_id IS NOT NULL
      ORDER BY s.usn`,
    [assessment.id, assessment.section_id]
  );
  return rows;
}

// ---------------- Lecturer / admin ----------------

exports.list = needsMigration(async (req, res) => {
  const { teachingAssignmentId } = req.query;
  await assertTeaches(req.user, teachingAssignmentId);
  const [rows] = await pool.query(
    `SELECT a.id, a.title, a.kind, a.max_marks, a.held_on, a.is_published, a.published_at, a.created_at,
            COUNT(m.student_id) AS entered,
            SUM(m.is_absent) AS absent,
            ROUND(AVG(m.marks), 2) AS average,
            MAX(m.marks) AS highest
       FROM assessments a
       LEFT JOIN assessment_marks m ON m.assessment_id = a.id AND (m.marks IS NOT NULL OR m.is_absent = 1)
      WHERE a.teaching_assignment_id = ?
      GROUP BY a.id
      ORDER BY COALESCE(a.held_on, DATE(a.created_at)), a.id`,
    [teachingAssignmentId]
  );
  res.json({ success: true, data: rows });
});

exports.create = needsMigration(async (req, res) => {
  const b = req.body;
  await assertTeaches(req.user, b.teachingAssignmentId);
  const [r] = await pool.query(
    'INSERT INTO assessments (teaching_assignment_id, title, kind, max_marks, held_on, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    [b.teachingAssignmentId, b.title, b.kind, b.maxMarks, b.heldOn || null, req.user.id]
  );
  res.status(201).json({ success: true, data: { id: r.insertId } });
});

exports.update = needsMigration(async (req, res) => {
  const a = await getAssessment(req.params.id, req.user);
  const b = req.body;
  if (b.maxMarks !== undefined) {
    const [[{ top }]] = await pool.query('SELECT MAX(marks) AS top FROM assessment_marks WHERE assessment_id = ?', [a.id]);
    if (top !== null && Number(top) > b.maxMarks) throw new ApiError(400, `Maximum marks cannot be below the highest mark entered (${Number(top)})`);
  }
  await pool.query(
    'UPDATE assessments SET title = ?, kind = ?, max_marks = ?, held_on = ? WHERE id = ?',
    [b.title ?? a.title, b.kind ?? a.kind, b.maxMarks ?? a.max_marks, b.heldOn === '' ? null : (b.heldOn ?? a.held_on), a.id]
  );
  res.json({ success: true, message: 'Assessment updated' });
});

exports.remove = needsMigration(async (req, res) => {
  const a = await getAssessment(req.params.id, req.user);
  const [marks] = await pool.query('SELECT student_id, marks, is_absent FROM assessment_marks WHERE assessment_id = ?', [a.id]);
  await pool.query('DELETE FROM assessments WHERE id = ?', [a.id]);
  await audit(req, 'ASSESSMENT_DELETED', 'assessment', a.id,
    { title: a.title, subjectCode: a.subject_code, sectionName: a.section_name, maxMarks: Number(a.max_marks), marksEntered: marks.length, marks }, null);
  res.json({ success: true, message: 'Assessment deleted' });
});

exports.get = needsMigration(async (req, res) => {
  const a = await getAssessment(req.params.id, req.user);
  res.json({ success: true, data: { ...a, students: await roster(pool, a) } });
});

// Save marks for some or all students. marks: null clears; absent: true marks the student absent (marks ignored).
exports.saveMarks = needsMigration(async (req, res) => {
  const a = await getAssessment(req.params.id, req.user);
  const max = Number(a.max_marks);
  await withTransaction(async (conn) => {
    const allowed = new Set((await roster(conn, a)).map((r) => r.student_id));
    for (const m of req.body.marks) {
      if (!allowed.has(m.studentId)) throw new ApiError(400, `Student ${m.studentId} is not in this class`);
      if (!m.absent && m.marks !== null && m.marks !== undefined && m.marks > max) {
        throw new ApiError(400, `Marks cannot be more than ${max} (student ${m.studentId})`);
      }
      const marks = m.absent ? null : (m.marks ?? null);
      await conn.query(
        `INSERT INTO assessment_marks (assessment_id, student_id, marks, is_absent, remarks, updated_by)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE marks = VALUES(marks), is_absent = VALUES(is_absent), remarks = VALUES(remarks), updated_by = VALUES(updated_by)`,
        [a.id, m.studentId, marks, m.absent ? 1 : 0, m.remarks || null, req.user.id]
      );
    }
  });
  res.json({ success: true, message: `Saved ${req.body.marks.length} mark(s)` });
});

exports.publish = needsMigration(async (req, res) => {
  const a = await getAssessment(req.params.id, req.user);
  const { published } = req.body;
  await withTransaction(async (conn) => {
    await conn.query('UPDATE assessments SET is_published = ?, published_at = IF(?, COALESCE(published_at, NOW()), NULL) WHERE id = ?',
      [published ? 1 : 0, published ? 1 : 0, a.id]);
    if (published && !a.is_published) {
      const [users] = await conn.query(
        `SELECT DISTINCT s.user_id FROM students s
           LEFT JOIN assessment_marks m ON m.assessment_id = ? AND m.student_id = s.id
          WHERE (s.section_id = ? AND s.status = 'active') OR m.student_id IS NOT NULL`,
        [a.id, a.section_id]
      );
      await notifyUsers(conn, users.map((u) => u.user_id), {
        type: 'system', title: `Marks published: ${a.subject_code} ${a.title}`,
        message: `${a.subject_name} — ${a.title} (out of ${Number(a.max_marks)})`, entityType: 'assessment', entityId: a.id,
      });
    }
  });
  res.json({ success: true, message: published ? 'Published to students' : 'Hidden from students' });
});

// Class summary: every student × every assessment, with totals (for the table and CSV / PDF export).
exports.classSummary = needsMigration(async (req, res) => {
  const taId = req.params.teachingAssignmentId;
  await assertTeaches(req.user, taId);
  const [assessments] = await pool.query(
    'SELECT id, title, kind, max_marks, held_on, is_published FROM assessments WHERE teaching_assignment_id = ? ORDER BY COALESCE(held_on, DATE(created_at)), id',
    [taId]
  );
  const [students] = await pool.query(
    `SELECT s.id AS student_id, s.usn, u.full_name FROM students s JOIN users u ON u.id = s.user_id
      WHERE (s.status = 'active' AND s.section_id = (SELECT section_id FROM teaching_assignments WHERE id = ?))
         OR s.id IN (SELECT m.student_id FROM assessment_marks m JOIN assessments a ON a.id = m.assessment_id WHERE a.teaching_assignment_id = ?)
      ORDER BY s.usn`,
    [taId, taId]
  );
  const [marks] = assessments.length
    ? await pool.query('SELECT assessment_id, student_id, marks, is_absent FROM assessment_marks WHERE assessment_id IN (?)', [assessments.map((a) => a.id)])
    : [[]];
  const key = (aId, sId) => `${aId}:${sId}`;
  const byKey = new Map(marks.map((m) => [key(m.assessment_id, m.student_id), m]));
  const maxTotal = assessments.reduce((n, a) => n + Number(a.max_marks), 0);
  const rows = students.map((s) => {
    const cells = assessments.map((a) => {
      const m = byKey.get(key(a.id, s.student_id));
      return m ? (m.is_absent ? 'AB' : m.marks === null ? null : Number(m.marks)) : null;
    });
    const total = cells.reduce((n, c) => n + (typeof c === 'number' ? c : 0), 0);
    return { ...s, marks: cells, total: Math.round(total * 100) / 100, percentage: pct(total, maxTotal) };
  });
  res.json({ success: true, data: { assessments, students: rows, maxTotal } });
});

// ---------------- Student ----------------

// Own published marks grouped by subject.
exports.mine = needsMigration(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT ta.id AS teaching_assignment_id, sub.code AS subject_code, sub.name AS subject_name,
            a.id AS assessment_id, a.title, a.kind, a.max_marks, a.held_on, a.published_at,
            m.marks, m.is_absent, m.remarks,
            (SELECT ROUND(AVG(x.marks), 2) FROM assessment_marks x WHERE x.assessment_id = a.id AND x.marks IS NOT NULL) AS class_average
       FROM students s
       JOIN teaching_assignments ta ON ta.section_id = s.section_id
       JOIN subjects sub ON sub.id = ta.subject_id
       JOIN assessments a ON a.teaching_assignment_id = ta.id AND a.is_published = 1
       LEFT JOIN assessment_marks m ON m.assessment_id = a.id AND m.student_id = s.id
      WHERE s.id = ?
      ORDER BY sub.code, COALESCE(a.held_on, DATE(a.created_at)), a.id`,
    [req.user.profileId]
  );
  const subjects = new Map();
  for (const r of rows) {
    if (!subjects.has(r.teaching_assignment_id)) {
      subjects.set(r.teaching_assignment_id, { teaching_assignment_id: r.teaching_assignment_id, subject_code: r.subject_code, subject_name: r.subject_name, assessments: [], total: 0, max_total: 0 });
    }
    const s = subjects.get(r.teaching_assignment_id);
    s.assessments.push({
      id: r.assessment_id, title: r.title, kind: r.kind, max_marks: Number(r.max_marks), held_on: r.held_on,
      marks: r.marks === null ? null : Number(r.marks), is_absent: !!r.is_absent, remarks: r.remarks,
      class_average: r.class_average === null ? null : Number(r.class_average),
    });
    s.total += r.marks === null ? 0 : Number(r.marks);
    s.max_total += Number(r.max_marks);
  }
  const data = [...subjects.values()].map((s) => ({ ...s, total: Math.round(s.total * 100) / 100, percentage: pct(s.total, s.max_total) }));
  res.json({ success: true, data });
});
