const { pool, withTransaction } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');
const { buildUpdate, toSqlDateTime } = require('../../utils/sql');
const { assertTeaches } = require('../../utils/ownership');
const { saveFileRecord } = require('../../utils/files');
const { notifyUsers, sectionStudentUserIds } = require('../../utils/notify');

// =====================================================================
//  LECTURER / ADMIN  (mounted at /api/assignments/manage)
// =====================================================================

// Loads an assignment together with its teaching assignment and checks the lecturer owns it.
async function loadManaged(user, assignmentId, conn = pool) {
  const [rows] = await conn.query(
    `SELECT a.*, ta.lecturer_id, ta.section_id FROM assignments a
       JOIN teaching_assignments ta ON ta.id = a.teaching_assignment_id WHERE a.id = ?`,
    [assignmentId]
  );
  if (!rows[0]) throw new ApiError(404, 'Assignment not found');
  if (user.role === 'lecturer' && rows[0].lecturer_id !== user.profileId) {
    throw new ApiError(403, 'This assignment belongs to another lecturer');
  }
  return rows[0];
}

exports.listManaged = asyncHandler(async (req, res) => {
  const where = ['1=1'];
  const params = [];
  if (req.user.role === 'lecturer') { where.push('ta.lecturer_id = ?'); params.push(req.user.profileId); }
  if (req.query.teachingAssignmentId) { where.push('a.teaching_assignment_id = ?'); params.push(req.query.teachingAssignmentId); }
  if (req.query.status) { where.push('a.status = ?'); params.push(req.query.status); }
  const [rows] = await pool.query(
    `SELECT a.id, a.title, a.deadline, a.status, a.max_marks, a.created_at, a.teaching_assignment_id,
            sub.code AS subject_code, sub.name AS subject_name, sec.name AS section_name, lu.full_name AS lecturer_name,
            (SELECT COUNT(*) FROM assignment_submissions x WHERE x.assignment_id = a.id) AS total_students,
            (SELECT COUNT(*) FROM assignment_submissions x WHERE x.assignment_id = a.id AND x.status = 'submitted') AS submitted_count
       FROM assignments a
       JOIN teaching_assignments ta ON ta.id = a.teaching_assignment_id
       JOIN subjects sub ON sub.id = ta.subject_id
       JOIN sections sec ON sec.id = ta.section_id
       JOIN lecturers l ON l.id = ta.lecturer_id
       JOIN users lu ON lu.id = l.user_id
      WHERE ${where.join(' AND ')}
      ORDER BY a.deadline DESC`,
    params
  );
  res.json({ success: true, data: rows });
});

exports.getManaged = asyncHandler(async (req, res) => {
  const a = await loadManaged(req.user, req.params.id);
  const [files] = await pool.query(
    `SELECT f.id AS file_id, f.original_name, f.extension, f.size_bytes
       FROM assignment_files af JOIN files f ON f.id = af.file_id WHERE af.assignment_id = ?`,
    [a.id]
  );
  res.json({ success: true, data: { ...a, files } });
});

// multipart/form-data (optional attachments in field "files")
exports.create = asyncHandler(async (req, res) => {
  if (req.user.role !== 'lecturer') throw new ApiError(403, 'Only lecturers can create assignments');
  const b = req.body;
  await assertTeaches(req.user, b.teachingAssignmentId);
  const deadline = toSqlDateTime(b.deadline);
  if (!deadline) throw new ApiError(400, 'Invalid deadline');

  const id = await withTransaction(async (conn) => {
    const [r] = await conn.query(
      `INSERT INTO assignments (teaching_assignment_id, title, description, max_marks, deadline,
                                allow_online, allow_manual, allow_late, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [b.teachingAssignmentId, b.title, b.description || null, b.maxMarks ?? null, deadline,
       b.allowOnline, b.allowManual, b.allowLate, req.user.profileId]
    );
    for (const file of req.files || []) {
      const fileId = await saveFileRecord(conn, file, req.user.id);
      await conn.query('INSERT INTO assignment_files (assignment_id, file_id) VALUES (?, ?)', [r.insertId, fileId]);
    }
    return r.insertId;
  });
  res.status(201).json({ success: true, data: { id, status: 'draft' } });
});

exports.update = asyncHandler(async (req, res) => {
  const a = await loadManaged(req.user, req.params.id);
  if (a.status === 'closed') throw new ApiError(400, 'A closed assignment cannot be edited');

  const body = { ...req.body };
  if (body.deadline) {
    body.deadline = toSqlDateTime(body.deadline);
    if (!body.deadline) throw new ApiError(400, 'Invalid deadline');
  }
  const { sets, values } = buildUpdate({
    title: 'title', description: 'description', maxMarks: 'max_marks', deadline: 'deadline',
    allowOnline: 'allow_online', allowManual: 'allow_manual', allowLate: 'allow_late',
  }, body);
  if (!sets.length) throw new ApiError(400, 'Nothing to update');

  await withTransaction(async (conn) => {
    await conn.query(`UPDATE assignments SET ${sets.join(', ')} WHERE id = ?`, [...values, a.id]);
    if (a.status === 'published' && body.deadline && body.deadline !== a.deadline) {
      const userIds = await sectionStudentUserIds(conn, a.section_id);
      await notifyUsers(conn, userIds, {
        type: 'assignment_posted', title: 'Assignment deadline changed',
        message: `${a.title} - new deadline ${body.deadline}`, entityType: 'assignment', entityId: a.id,
      });
    }
  });
  res.json({ success: true, message: 'Assignment updated' });
});

// draft -> published. The stored procedure creates one "not submitted" row per student and sends notifications.
exports.publish = asyncHandler(async (req, res) => {
  if (req.user.role !== 'lecturer') throw new ApiError(403, 'Only lecturers can publish assignments');
  const a = await loadManaged(req.user, req.params.id);
  if (a.status !== 'draft') throw new ApiError(400, 'Only a draft can be published');
  const [[check]] = await pool.query('SELECT deadline > NOW() AS in_future FROM assignments WHERE id = ?', [a.id]);
  if (!check.in_future) throw new ApiError(400, 'Deadline must be in the future before publishing');

  await pool.query('CALL sp_publish_assignment(?)', [a.id]);
  res.json({ success: true, message: 'Assignment published and students notified' });
});

exports.close = asyncHandler(async (req, res) => {
  const a = await loadManaged(req.user, req.params.id);
  if (a.status !== 'published') throw new ApiError(400, 'Only a published assignment can be closed');
  await pool.query("UPDATE assignments SET status = 'closed' WHERE id = ?", [a.id]);
  res.json({ success: true, message: 'Assignment closed' });
});

exports.remove = asyncHandler(async (req, res) => {
  const a = await loadManaged(req.user, req.params.id);
  if (a.status !== 'draft') throw new ApiError(400, 'Only a draft can be deleted. Close published assignments instead.');
  await pool.query('DELETE FROM assignments WHERE id = ?', [a.id]);
  res.json({ success: true, message: 'Assignment deleted' });
});

// Submitted / not submitted list with links and uploaded PDFs
exports.submissions = asyncHandler(async (req, res) => {
  const a = await loadManaged(req.user, req.params.id);
  const where = ['sb.assignment_id = ?'];
  const params = [a.id];
  if (req.query.status) { where.push('sb.status = ?'); params.push(req.query.status); }

  const [rows] = await pool.query(
    `SELECT sb.id, sb.student_id, s.usn, u.full_name, sb.status, sb.submission_mode, sb.submission_url,
            sb.submitted_at, sb.is_late, sb.marks, sb.feedback, sb.graded_at
       FROM assignment_submissions sb
       JOIN students s ON s.id = sb.student_id
       JOIN users u ON u.id = s.user_id
      WHERE ${where.join(' AND ')} ORDER BY s.usn`,
    params
  );
  if (rows.length) {
    const [files] = await pool.query(
      `SELECT sf.submission_id, f.id AS file_id, f.original_name
         FROM submission_files sf JOIN files f ON f.id = sf.file_id WHERE sf.submission_id IN (?)`,
      [rows.map((r) => r.id)]
    );
    rows.forEach((r) => { r.files = files.filter((f) => f.submission_id === r.id); });
  }
  const submitted = rows.filter((r) => r.status === 'submitted').length;
  res.json({ success: true, data: rows, summary: { total: rows.length, submitted, notSubmitted: rows.length - submitted } });
});

exports.grade = asyncHandler(async (req, res) => {
  const { marks, feedback } = req.body;
  const [rows] = await pool.query(
    `SELECT sb.id, sb.status, a.max_marks, a.title, ta.lecturer_id, s.user_id AS student_user_id
       FROM assignment_submissions sb
       JOIN assignments a ON a.id = sb.assignment_id
       JOIN teaching_assignments ta ON ta.id = a.teaching_assignment_id
       JOIN students s ON s.id = sb.student_id
      WHERE sb.id = ?`,
    [req.params.submissionId]
  );
  const sb = rows[0];
  if (!sb) throw new ApiError(404, 'Submission not found');
  if (req.user.role === 'lecturer' && sb.lecturer_id !== req.user.profileId) throw new ApiError(403, 'Not your assignment');
  if (sb.status !== 'submitted') throw new ApiError(400, 'Cannot grade a submission that is not submitted');
  if (sb.max_marks !== null && marks > sb.max_marks) throw new ApiError(400, `Marks cannot exceed ${sb.max_marks}`);

  await withTransaction(async (conn) => {
    await conn.query(
      'UPDATE assignment_submissions SET marks = ?, feedback = ?, graded_by = ?, graded_at = NOW() WHERE id = ?',
      [marks, feedback || null, req.user.role === 'lecturer' ? req.user.profileId : null, sb.id]
    );
    await notifyUsers(conn, [sb.student_user_id], {
      type: 'system', title: 'Assignment graded', message: sb.title, entityType: 'assignment', entityId: null,
    });
  });
  res.json({ success: true, message: 'Marks saved' });
});

// =====================================================================
//  STUDENT  (mounted at /api/assignments/student)
// =====================================================================

exports.studentList = asyncHandler(async (req, res) => {
  const where = ['student_id = ?'];
  const params = [req.user.profileId];
  if (req.query.displayStatus) { where.push('display_status = ?'); params.push(req.query.displayStatus); }
  const [rows] = await pool.query(
    `SELECT assignment_id, title, subject_name, deadline, assignment_status, submission_status, submission_mode,
            submitted_at, marks, display_status
       FROM v_student_assignments WHERE ${where.join(' AND ')}
      ORDER BY (submission_status = 'submitted'), deadline`,
    params
  );
  res.json({ success: true, data: rows });
});

// Dashboard alert strip: pending items due within 24 h + overdue not-submitted items
exports.studentAlerts = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT assignment_id, title, subject_name, deadline, display_status
       FROM v_student_assignments
      WHERE student_id = ? AND submission_status = 'not_submitted'
        AND assignment_status = 'published' AND display_status IN ('Due soon', 'Overdue')
      ORDER BY deadline`,
    [req.user.profileId]
  );
  res.json({
    success: true,
    data: { dueSoon: rows.filter((r) => r.display_status === 'Due soon'), overdue: rows.filter((r) => r.display_status === 'Overdue') },
  });
});

exports.studentDetail = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT a.id, a.title, a.description, a.max_marks, a.deadline, a.status AS assignment_status,
            a.allow_online, a.allow_manual, a.allow_late, a.deadline < NOW() AS past_due,
            sub.code AS subject_code, sub.name AS subject_name, lu.full_name AS lecturer_name,
            sb.id AS submission_id, sb.status AS submission_status, sb.submission_mode, sb.submission_url,
            sb.submitted_at, sb.is_late, sb.marks, sb.feedback
       FROM assignment_submissions sb
       JOIN assignments a ON a.id = sb.assignment_id
       JOIN teaching_assignments ta ON ta.id = a.teaching_assignment_id
       JOIN subjects sub ON sub.id = ta.subject_id
       JOIN lecturers l ON l.id = ta.lecturer_id
       JOIN users lu ON lu.id = l.user_id
      WHERE sb.assignment_id = ? AND sb.student_id = ?`,
    [req.params.id, req.user.profileId]
  );
  if (!rows[0]) throw new ApiError(404, 'Assignment not found');
  const [attachments] = await pool.query(
    'SELECT f.id AS file_id, f.original_name, f.extension, f.size_bytes FROM assignment_files af JOIN files f ON f.id = af.file_id WHERE af.assignment_id = ?',
    [req.params.id]
  );
  const [myFiles] = await pool.query(
    'SELECT f.id AS file_id, f.original_name FROM submission_files sf JOIN files f ON f.id = sf.file_id WHERE sf.submission_id = ?',
    [rows[0].submission_id]
  );
  res.json({ success: true, data: { ...rows[0], pastDue: !!rows[0].past_due, attachments, myFiles } });
});

// Locks the student's submission row and checks every rule before a change is allowed.
async function lockSubmission(conn, assignmentId, studentId, mode) {
  const [rows] = await conn.query(
    `SELECT sb.id, sb.status, sb.graded_at, a.status AS assignment_status,
            a.allow_online, a.allow_manual, a.allow_late, (a.deadline < NOW()) AS past_due
       FROM assignment_submissions sb JOIN assignments a ON a.id = sb.assignment_id
      WHERE sb.assignment_id = ? AND sb.student_id = ? FOR UPDATE`,
    [assignmentId, studentId]
  );
  const sb = rows[0];
  if (!sb) throw new ApiError(404, 'Assignment not found');
  if (sb.assignment_status !== 'published') throw new ApiError(400, 'This assignment is closed');
  if (sb.graded_at) throw new ApiError(400, 'This submission is already graded and cannot be changed');
  if (mode === 'manual' && !sb.allow_manual) throw new ApiError(400, 'Manual submission is not allowed for this assignment');
  if (mode === 'online' && !sb.allow_online) throw new ApiError(400, 'Online submission is not allowed for this assignment');
  if (sb.past_due && !sb.allow_late) throw new ApiError(400, 'The deadline has passed');
  return sb;
}

// "I submitted it in person" button
exports.submitManual = asyncHandler(async (req, res) => {
  await withTransaction(async (conn) => {
    const sb = await lockSubmission(conn, req.params.id, req.user.profileId, 'manual');
    await conn.query('DELETE FROM submission_files WHERE submission_id = ?', [sb.id]);
    await conn.query(
      `UPDATE assignment_submissions
          SET status = 'submitted', submission_mode = 'manual', submission_url = NULL,
              submitted_at = NOW(), is_late = ? WHERE id = ?`,
      [sb.past_due ? 1 : 0, sb.id]
    );
  });
  res.json({ success: true, message: 'Marked as submitted' });
});

exports.submitUrl = asyncHandler(async (req, res) => {
  await withTransaction(async (conn) => {
    const sb = await lockSubmission(conn, req.params.id, req.user.profileId, 'online');
    await conn.query('DELETE FROM submission_files WHERE submission_id = ?', [sb.id]);
    await conn.query(
      `UPDATE assignment_submissions
          SET status = 'submitted', submission_mode = 'online', submission_url = ?,
              submitted_at = NOW(), is_late = ? WHERE id = ?`,
      [req.body.url, sb.past_due ? 1 : 0, sb.id]
    );
  });
  res.json({ success: true, message: 'Link submitted' });
});

// multipart/form-data, field "file" (PDF)
exports.submitFile = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'PDF file is required (field name: file)');
  await withTransaction(async (conn) => {
    const sb = await lockSubmission(conn, req.params.id, req.user.profileId, 'online');
    const fileId = await saveFileRecord(conn, req.file, req.user.id);
    await conn.query('DELETE FROM submission_files WHERE submission_id = ?', [sb.id]);
    await conn.query('INSERT INTO submission_files (submission_id, file_id) VALUES (?, ?)', [sb.id, fileId]);
    await conn.query(
      `UPDATE assignment_submissions
          SET status = 'submitted', submission_mode = 'online', submission_url = NULL,
              submitted_at = NOW(), is_late = ? WHERE id = ?`,
      [sb.past_due ? 1 : 0, sb.id]
    );
  });
  res.json({ success: true, message: 'File submitted' });
});

// "Not submitted" button: student takes the submission back (only before the deadline and before grading)
exports.unsubmit = asyncHandler(async (req, res) => {
  await withTransaction(async (conn) => {
    const [rows] = await conn.query(
      `SELECT sb.id, sb.graded_at, a.status AS assignment_status, (a.deadline < NOW()) AS past_due
         FROM assignment_submissions sb JOIN assignments a ON a.id = sb.assignment_id
        WHERE sb.assignment_id = ? AND sb.student_id = ? FOR UPDATE`,
      [req.params.id, req.user.profileId]
    );
    const sb = rows[0];
    if (!sb) throw new ApiError(404, 'Assignment not found');
    if (sb.assignment_status !== 'published' || sb.past_due) throw new ApiError(400, 'Submission can no longer be changed');
    if (sb.graded_at) throw new ApiError(400, 'Already graded');
    await conn.query('DELETE FROM submission_files WHERE submission_id = ?', [sb.id]);
    await conn.query(
      `UPDATE assignment_submissions
          SET status = 'not_submitted', submission_mode = NULL, submission_url = NULL, submitted_at = NULL, is_late = 0
        WHERE id = ?`,
      [sb.id]
    );
  });
  res.json({ success: true, message: 'Marked as not submitted' });
});
