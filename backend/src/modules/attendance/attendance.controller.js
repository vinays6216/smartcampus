const env = require('../../config/env');
const { pool, withTransaction } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');
const { todayLocal } = require('../../utils/sql');
const { assertTeaches } = require('../../utils/ownership');
const { saveFileRecord } = require('../../utils/files');
const { notifyUsers } = require('../../utils/notify');

// =====================================================================
//  STUDENT
// =====================================================================

// Subject-wise summary + overall percentage
exports.mySummary = asyncHandler(async (req, res) => {
  const [subjects] = await pool.query(
    `SELECT teaching_assignment_id, subject_code, subject_name, total_classes, attended_classes,
            absent_classes, attendance_percentage
       FROM v_student_subject_attendance WHERE student_id = ? ORDER BY subject_code`,
    [req.user.profileId]
  );
  const total = subjects.reduce((n, s) => n + Number(s.total_classes), 0);
  const attended = subjects.reduce((n, s) => n + Number(s.attended_classes), 0);
  const overall = total ? Math.round((attended / total) * 10000) / 100 : null;
  res.json({
    success: true,
    data: {
      minRequiredPercent: env.attendanceMinPercent,
      overallPercentage: overall,
      subjects: subjects.map((s) => ({ ...s, belowMinimum: s.attendance_percentage !== null && s.attendance_percentage < env.attendanceMinPercent })),
    },
  });
});

// Day-by-day list: which day absent, which day present (+ issue status)
exports.myDetail = asyncHandler(async (req, res) => {
  const { from, to, subjectCode, status } = req.query;
  const where = ['student_id = ?'];
  const params = [req.user.profileId];
  if (from) { where.push('session_date >= ?'); params.push(from); }
  if (to) { where.push('session_date <= ?'); params.push(to); }
  if (subjectCode) { where.push('subject_code = ?'); params.push(subjectCode); }
  if (status) { where.push('status = ?'); params.push(status); }
  const [rows] = await pool.query(
    `SELECT attendance_record_id, session_date, period_no, subject_code, subject_name, status, issue_id, issue_status
       FROM v_student_attendance_detail WHERE ${where.join(' AND ')}
      ORDER BY session_date DESC, period_no`,
    params
  );
  res.json({ success: true, data: rows });
});

// Student says "I was present but marked absent"
exports.raiseIssue = asyncHandler(async (req, res) => {
  const { attendanceRecordId, reason } = req.body;

  const result = await withTransaction(async (conn) => {
    const [rows] = await conn.query(
      `SELECT ar.id, ar.status, ses.session_date, sub.name AS subject_name, l.user_id AS lecturer_user_id,
              DATEDIFF(CURDATE(), ses.session_date) AS days_ago
         FROM attendance_records ar
         JOIN attendance_sessions ses ON ses.id = ar.session_id
         JOIN teaching_assignments ta ON ta.id = ses.teaching_assignment_id
         JOIN subjects sub ON sub.id = ta.subject_id
         JOIN lecturers l ON l.id = ta.lecturer_id
        WHERE ar.id = ? AND ar.student_id = ?
          FOR UPDATE`,
      [attendanceRecordId, req.user.profileId]
    );
    const rec = rows[0];
    if (!rec) throw new ApiError(404, 'Attendance record not found');
    if (rec.status !== 'absent') throw new ApiError(400, 'An issue can be raised only for an absent entry');
    if (rec.days_ago > env.attendanceIssueWindowDays) {
      throw new ApiError(400, `Issues can be raised only within ${env.attendanceIssueWindowDays} days of the class`);
    }
    const [existing] = await conn.query(
      "SELECT id FROM attendance_issues WHERE attendance_record_id = ? AND status <> 'withdrawn'",
      [attendanceRecordId]
    );
    if (existing.length) throw new ApiError(409, 'An issue has already been raised for this entry');

    const proofFileId = req.file ? await saveFileRecord(conn, req.file, req.user.id) : null;
    const [r] = await conn.query(
      'INSERT INTO attendance_issues (attendance_record_id, student_id, reason, proof_file_id) VALUES (?, ?, ?, ?)',
      [attendanceRecordId, req.user.profileId, reason, proofFileId]
    );
    await notifyUsers(conn, [rec.lecturer_user_id], {
      type: 'attendance_issue_raised',
      title: 'Attendance issue raised',
      message: `${rec.subject_name} on ${rec.session_date}`,
      entityType: 'attendance_issue',
      entityId: r.insertId,
    });
    return r.insertId;
  });
  res.status(201).json({ success: true, data: { id: result } });
});

exports.myIssues = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT ai.id, ai.status, ai.reason, ai.proof_file_id, ai.resolution_remarks, ai.raised_at, ai.resolved_at,
            ses.session_date, ses.period_no, sub.code AS subject_code, sub.name AS subject_name
       FROM attendance_issues ai
       JOIN attendance_records ar ON ar.id = ai.attendance_record_id
       JOIN attendance_sessions ses ON ses.id = ar.session_id
       JOIN teaching_assignments ta ON ta.id = ses.teaching_assignment_id
       JOIN subjects sub ON sub.id = ta.subject_id
      WHERE ai.student_id = ?
      ORDER BY ai.raised_at DESC`,
    [req.user.profileId]
  );
  res.json({ success: true, data: rows });
});

exports.withdrawIssue = asyncHandler(async (req, res) => {
  const [r] = await pool.query(
    "UPDATE attendance_issues SET status = 'withdrawn' WHERE id = ? AND student_id = ? AND status = 'open'",
    [req.params.id, req.user.profileId]
  );
  if (!r.affectedRows) throw new ApiError(404, 'Open issue not found');
  res.json({ success: true, message: 'Issue withdrawn' });
});

// =====================================================================
//  LECTURER (and admin for read-only views)
// =====================================================================

async function loadRoster(conn, teachingAssignmentId) {
  const [rows] = await conn.query(
    `SELECT s.id FROM students s
       JOIN teaching_assignments ta ON ta.section_id = s.section_id
      WHERE ta.id = ? AND s.status = 'active'`,
    [teachingAssignmentId]
  );
  return new Set(rows.map((r) => r.id));
}

// Create a class session and mark everybody. Students missing from "records" default to present.
exports.createSession = asyncHandler(async (req, res) => {
  if (req.user.role !== 'lecturer') throw new ApiError(403, 'Only lecturers can mark attendance');
  const b = req.body;
  await assertTeaches(req.user, b.teachingAssignmentId);
  if (b.sessionDate > todayLocal()) throw new ApiError(400, 'Attendance cannot be marked for a future date');

  const sessionId = await withTransaction(async (conn) => {
    const roster = await loadRoster(conn, b.teachingAssignmentId);
    if (!roster.size) throw new ApiError(400, 'No active students in this section');
    const marks = new Map();
    for (const r of b.records) {
      if (!roster.has(r.studentId)) throw new ApiError(400, `Student ${r.studentId} is not in this class`);
      marks.set(r.studentId, r);
    }
    const [s] = await conn.query(
      `INSERT INTO attendance_sessions (teaching_assignment_id, session_date, period_no, start_time, end_time, topic, marked_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [b.teachingAssignmentId, b.sessionDate, b.periodNo, b.startTime || null, b.endTime || null, b.topic || null, req.user.profileId]
    );
    const rows = [...roster].map((studentId) => {
      const m = marks.get(studentId);
      return [s.insertId, studentId, m ? m.status : 'present', m ? m.remarks || null : null];
    });
    await conn.query('INSERT INTO attendance_records (session_id, student_id, status, remarks) VALUES ?', [rows]);
    return s.insertId;
  });
  res.status(201).json({ success: true, data: { sessionId } });
});

async function getSessionOrFail(sessionId) {
  const [rows] = await pool.query(
    `SELECT ses.*, sub.code AS subject_code, sub.name AS subject_name, sec.name AS section_name
       FROM attendance_sessions ses
       JOIN teaching_assignments ta ON ta.id = ses.teaching_assignment_id
       JOIN subjects sub ON sub.id = ta.subject_id
       JOIN sections sec ON sec.id = ta.section_id
      WHERE ses.id = ?`,
    [sessionId]
  );
  if (!rows[0]) throw new ApiError(404, 'Attendance session not found');
  return rows[0];
}

exports.getSession = asyncHandler(async (req, res) => {
  const session = await getSessionOrFail(req.params.id);
  await assertTeaches(req.user, session.teaching_assignment_id);
  const [records] = await pool.query(
    `SELECT ar.id AS record_id, ar.student_id, s.usn, u.full_name, ar.status, ar.remarks
       FROM attendance_records ar
       JOIN students s ON s.id = ar.student_id
       JOIN users u ON u.id = s.user_id
      WHERE ar.session_id = ? ORDER BY s.usn`,
    [req.params.id]
  );
  res.json({ success: true, data: { ...session, records } });
});

exports.listSessions = asyncHandler(async (req, res) => {
  const { teachingAssignmentId, from, to } = req.query;
  await assertTeaches(req.user, teachingAssignmentId);
  const where = ['ses.teaching_assignment_id = ?'];
  const params = [teachingAssignmentId];
  if (from) { where.push('ses.session_date >= ?'); params.push(from); }
  if (to) { where.push('ses.session_date <= ?'); params.push(to); }
  const [rows] = await pool.query(
    `SELECT ses.id, ses.session_date, ses.period_no, ses.topic,
            SUM(ar.status IN ('present','late')) AS present_count,
            SUM(ar.status = 'absent') AS absent_count
       FROM attendance_sessions ses
       LEFT JOIN attendance_records ar ON ar.session_id = ses.id
      WHERE ${where.join(' AND ')}
      GROUP BY ses.id, ses.session_date, ses.period_no, ses.topic
      ORDER BY ses.session_date DESC, ses.period_no`,
    params
  );
  res.json({ success: true, data: rows });
});

// Edit marks of a session. The DB trigger writes every status change into attendance_record_history.
exports.updateRecords = asyncHandler(async (req, res) => {
  if (req.user.role !== 'lecturer') throw new ApiError(403, 'Only lecturers can edit attendance');
  const session = await getSessionOrFail(req.params.id);
  await assertTeaches(req.user, session.teaching_assignment_id);

  await withTransaction(async (conn) => {
    await conn.query('SET @app_user_id = ?, @change_reason = ?', [req.user.id, req.body.reason || null]);
    try {
      for (const r of req.body.records) {
        const [u] = await conn.query(
          'UPDATE attendance_records SET status = ?, remarks = ? WHERE session_id = ? AND student_id = ?',
          [r.status, r.remarks || null, session.id, r.studentId]
        );
        if (!u.affectedRows) throw new ApiError(400, `Student ${r.studentId} is not part of this session`);
      }
    } finally {
      await conn.query('SET @app_user_id = NULL, @change_reason = NULL'); // pooled connections keep variables
    }
  });
  res.json({ success: true, message: 'Attendance updated' });
});

// Percentage report between two dates; ?below=75 lists only students under 75%
exports.report = asyncHandler(async (req, res) => {
  const { teachingAssignmentId, from, to, below } = req.query;
  await assertTeaches(req.user, teachingAssignmentId);
  const [result] = await pool.query('CALL sp_attendance_report(?, ?, ?, ?)', [
    teachingAssignmentId, from, to, below === undefined ? null : below,
  ]);
  res.json({ success: true, data: result[0], filter: { from, to, belowPercent: below ?? null } });
});

// Issues raised by students of the lecturer's classes (admin sees all)
exports.listIssues = asyncHandler(async (req, res) => {
  const where = ['1=1'];
  const params = [];
  if (req.user.role === 'lecturer') { where.push('ta.lecturer_id = ?'); params.push(req.user.profileId); }
  if (req.query.status) { where.push('ai.status = ?'); params.push(req.query.status); }
  const [rows] = await pool.query(
    `SELECT ai.id, ai.status, ai.reason, ai.proof_file_id, ai.resolution_remarks, ai.raised_at, ai.resolved_at,
            ar.id AS attendance_record_id, ses.session_date, ses.period_no,
            sub.code AS subject_code, sub.name AS subject_name, sec.name AS section_name,
            s.usn, u.full_name AS student_name
       FROM attendance_issues ai
       JOIN attendance_records ar ON ar.id = ai.attendance_record_id
       JOIN attendance_sessions ses ON ses.id = ar.session_id
       JOIN teaching_assignments ta ON ta.id = ses.teaching_assignment_id
       JOIN subjects sub ON sub.id = ta.subject_id
       JOIN sections sec ON sec.id = ta.section_id
       JOIN students s ON s.id = ai.student_id
       JOIN users u ON u.id = s.user_id
      WHERE ${where.join(' AND ')}
      ORDER BY FIELD(ai.status, 'open') DESC, ai.raised_at DESC`,
    params
  );
  res.json({ success: true, data: rows });
});

// Approve (marks the student present) or reject
exports.resolveIssue = asyncHandler(async (req, res) => {
  const { decision, remarks } = req.body;

  await withTransaction(async (conn) => {
    const [rows] = await conn.query(
      `SELECT ai.id, ai.status, ai.attendance_record_id, s.user_id AS student_user_id,
              ta.lecturer_id, sub.name AS subject_name, ses.session_date
         FROM attendance_issues ai
         JOIN attendance_records ar ON ar.id = ai.attendance_record_id
         JOIN attendance_sessions ses ON ses.id = ar.session_id
         JOIN teaching_assignments ta ON ta.id = ses.teaching_assignment_id
         JOIN subjects sub ON sub.id = ta.subject_id
         JOIN students s ON s.id = ai.student_id
        WHERE ai.id = ? FOR UPDATE`,
      [req.params.id]
    );
    const issue = rows[0];
    if (!issue) throw new ApiError(404, 'Issue not found');
    if (req.user.role === 'lecturer' && issue.lecturer_id !== req.user.profileId) {
      throw new ApiError(403, 'This issue belongs to another lecturer');
    }
    if (issue.status !== 'open') throw new ApiError(409, 'This issue is already resolved or withdrawn');

    const approved = decision === 'approve';
    await conn.query(
      `UPDATE attendance_issues SET status = ?, resolved_by = ?, resolution_remarks = ?, resolved_at = NOW() WHERE id = ?`,
      [approved ? 'approved' : 'rejected', req.user.role === 'lecturer' ? req.user.profileId : null, remarks || null, issue.id]
    );

    if (approved) {
      await conn.query('SET @app_user_id = ?, @change_reason = ?', [req.user.id, `Issue #${issue.id} approved`]);
      try {
        await conn.query("UPDATE attendance_records SET status = 'present' WHERE id = ?", [issue.attendance_record_id]);
      } finally {
        await conn.query('SET @app_user_id = NULL, @change_reason = NULL');
      }
    }

    await notifyUsers(conn, [issue.student_user_id], {
      type: 'attendance_issue_resolved',
      title: approved ? 'Attendance issue approved' : 'Attendance issue rejected',
      message: `${issue.subject_name} on ${issue.session_date}${remarks ? ` - ${remarks}` : ''}`,
      entityType: 'attendance_issue',
      entityId: issue.id,
    });
  });
  res.json({ success: true, message: `Issue ${decision === 'approve' ? 'approved' : 'rejected'}` });
});
