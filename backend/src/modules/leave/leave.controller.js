const { pool, withTransaction } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');
const { todayLocal } = require('../../utils/sql');
const { getStudent } = require('../../utils/profile');
const { saveFileRecord } = require('../../utils/files');
const { notifyUsers, sectionLecturerUserIds } = require('../../utils/notify');
const { audit } = require('../../utils/audit');

// Student leave requests (table leave_requests, database/migrations/003_leave_requests.sql).
// Approval turns the student's "absent" marks in the range into "excused" (logged by the history trigger);
// classes marked later in the range start as "excused" for that student (see attendance createSession).

const PAST_DAYS = 30;    // a leave may start at most this many days ago
const AHEAD_DAYS = 90;   // ... and at most this many days ahead

const needsMigration = (fn) => asyncHandler(async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (e) {
    if (e && e.code === 'ER_NO_SUCH_TABLE') throw new ApiError(503, 'Leave requests are not set up yet: run database/migrations/003_leave_requests.sql');
    throw e;
  }
});

const addDays = (date, n) => { const d = new Date(`${date}T00:00:00`); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };

const SELECT = `
  SELECT lr.id, lr.student_id, lr.from_date, lr.to_date, lr.leave_type, lr.reason, lr.proof_file_id, lr.status,
         lr.decided_at, lr.remarks, lr.excused_count, lr.created_at,
         DATEDIFF(lr.to_date, lr.from_date) + 1 AS days,
         s.usn, su.full_name AS student_name, sec.id AS section_id, sec.name AS section_name, sec.semester_no,
         p.code AS program_code, du.full_name AS decided_by_name, du.role AS decided_by_role
    FROM leave_requests lr
    JOIN students s  ON s.id = lr.student_id
    JOIN users su    ON su.id = s.user_id
    JOIN sections sec ON sec.id = s.section_id
    JOIN programs p  ON p.id = sec.program_id
    LEFT JOIN users du ON du.id = lr.decided_by`;

// ---------------- Student ----------------

exports.create = needsMigration(async (req, res) => {
  const { fromDate, toDate, leaveType, reason } = req.body;
  const today = todayLocal();
  if (fromDate > toDate) throw new ApiError(400, '"From" date must be on or before the "To" date');
  if (fromDate < addDays(today, -PAST_DAYS)) throw new ApiError(400, `Leave can start at most ${PAST_DAYS} days ago`);
  if (toDate > addDays(today, AHEAD_DAYS)) throw new ApiError(400, `Leave can end at most ${AHEAD_DAYS} days ahead`);
  const student = await getStudent(req.user.profileId);

  const id = await withTransaction(async (conn) => {
    const [[overlap]] = await conn.query(
      `SELECT id FROM leave_requests WHERE student_id = ? AND status IN ('open','approved')
        AND from_date <= ? AND to_date >= ? LIMIT 1`,
      [student.id, toDate, fromDate]
    );
    if (overlap) throw new ApiError(409, `These dates overlap your leave request #${overlap.id}`);
    const proofFileId = req.file ? await saveFileRecord(conn, req.file, req.user.id) : null;
    const [r] = await conn.query(
      'INSERT INTO leave_requests (student_id, from_date, to_date, leave_type, reason, proof_file_id) VALUES (?, ?, ?, ?, ?, ?)',
      [student.id, fromDate, toDate, leaveType, reason, proofFileId]
    );
    await notifyUsers(conn, await sectionLecturerUserIds(conn, student.section_id), {
      type: 'system', title: 'New leave request',
      message: `${student.usn}: ${fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`} (${leaveType})`,
      entityType: 'leave_request', entityId: r.insertId,
    });
    return r.insertId;
  });
  res.status(201).json({ success: true, data: { id } });
});

exports.mine = needsMigration(async (req, res) => {
  const [rows] = await pool.query(`${SELECT} WHERE lr.student_id = ? ORDER BY lr.from_date DESC, lr.id DESC`, [req.user.profileId]);
  res.json({ success: true, data: rows });
});

exports.withdraw = needsMigration(async (req, res) => {
  const [r] = await pool.query(
    "UPDATE leave_requests SET status = 'withdrawn' WHERE id = ? AND student_id = ? AND status = 'open'",
    [req.params.id, req.user.profileId]
  );
  if (!r.affectedRows) throw new ApiError(404, 'Open leave request not found');
  res.json({ success: true, message: 'Leave request withdrawn' });
});

// ---------------- Lecturer / admin ----------------

// Lecturer: students of sections they teach. Admin (attendance permission): everybody.
function scope(user) {
  if (user.role === 'admin') return ['1=1', []];
  return ['s.section_id IN (SELECT section_id FROM teaching_assignments WHERE lecturer_id = ?)', [user.profileId]];
}

exports.list = needsMigration(async (req, res) => {
  const [cond, params] = scope(req.user);
  const where = [cond];
  if (req.query.status) { where.push('lr.status = ?'); params.push(req.query.status); }
  const [rows] = await pool.query(
    `${SELECT} WHERE ${where.join(' AND ')} ORDER BY (lr.status = 'open') DESC, lr.from_date DESC, lr.id DESC LIMIT 300`,
    params
  );
  res.json({ success: true, data: rows });
});

exports.decide = needsMigration(async (req, res) => {
  const { decision, remarks } = req.body;
  const [cond, params] = scope(req.user);
  const result = await withTransaction(async (conn) => {
    const [[leave]] = await conn.query(
      `SELECT lr.*, s.user_id AS student_user_id FROM leave_requests lr JOIN students s ON s.id = lr.student_id
        WHERE lr.id = ? AND ${cond} FOR UPDATE`,
      [req.params.id, ...params]
    );
    if (!leave) throw new ApiError(404, 'Leave request not found');
    if (leave.status !== 'open') throw new ApiError(409, `This leave request is already ${leave.status}`);

    let excused = 0;
    if (decision === 'approve') {
      await conn.query('SET @app_user_id = ?, @change_reason = ?', [req.user.id, `Leave #${leave.id} approved`]);
      try {
        const [u] = await conn.query(
          `UPDATE attendance_records ar JOIN attendance_sessions ses ON ses.id = ar.session_id
              SET ar.status = 'excused', ar.remarks = ?
            WHERE ar.student_id = ? AND ar.status = 'absent' AND ses.session_date BETWEEN ? AND ?`,
          [`On leave (#${leave.id})`, leave.student_id, leave.from_date, leave.to_date]
        );
        excused = u.affectedRows;
      } finally {
        await conn.query('SET @app_user_id = NULL, @change_reason = NULL');
      }
    }
    await conn.query(
      'UPDATE leave_requests SET status = ?, decided_by = ?, decided_at = NOW(), remarks = ?, excused_count = ? WHERE id = ?',
      [decision === 'approve' ? 'approved' : 'rejected', req.user.id, remarks || null, excused, leave.id]
    );
    await notifyUsers(conn, [leave.student_user_id], {
      type: 'system',
      title: decision === 'approve' ? 'Leave approved' : 'Leave rejected',
      message: decision === 'approve'
        ? `Your leave ${leave.from_date} to ${leave.to_date} was approved${excused ? `; ${excused} absent mark(s) are now excused` : ''}.`
        : `Your leave ${leave.from_date} to ${leave.to_date} was rejected${remarks ? `: ${remarks}` : '.'}`,
      entityType: 'leave_request', entityId: leave.id,
    });
    return { excused, leave };
  });
  await audit(req, decision === 'approve' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED', 'leave_request', result.leave.id, null,
    { studentId: result.leave.student_id, from: result.leave.from_date, to: result.leave.to_date, excused: result.excused, remarks: remarks || null });
  res.json({ success: true, data: { excused: result.excused }, message: decision === 'approve' ? `Approved; ${result.excused} absent mark(s) excused` : 'Rejected' });
});

// Used by attendance createSession: students of these ids with approved leave on that date -> leave id.
exports.approvedLeaveOn = async (conn, studentIds, date) => {
  if (!studentIds.length) return new Map();
  try {
    const [rows] = await conn.query(
      `SELECT student_id, MIN(id) AS id FROM leave_requests
        WHERE status = 'approved' AND ? BETWEEN from_date AND to_date AND student_id IN (?)
        GROUP BY student_id`,
      [date, studentIds]
    );
    return new Map(rows.map((r) => [r.student_id, r.id]));
  } catch (e) {
    if (e && e.code === 'ER_NO_SUCH_TABLE') return new Map(); // migration not run: no leave
    throw e;
  }
};
