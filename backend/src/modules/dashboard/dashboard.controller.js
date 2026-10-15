const env = require('../../config/env');
const { pool } = require('../../config/db');
const asyncHandler = require('../../utils/asyncHandler');

// One call that fills the top cards of each role's dashboard.
exports.summary = asyncHandler(async (req, res) => {
  const { role, profileId, id: userId } = req.user;
  const [[unread]] = await pool.query('SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0', [userId]);
  let data = {};

  if (role === 'student') {
    const [[att]] = await pool.query(
      `SELECT ROUND(100 * SUM(attended_classes) / NULLIF(SUM(total_classes), 0), 2) AS overall_percentage,
              COALESCE(SUM(attendance_percentage < ?), 0) AS subjects_below_minimum
         FROM v_student_subject_attendance WHERE student_id = ?`,
      [env.attendanceMinPercent, profileId]
    );
    const [[asg]] = await pool.query(
      `SELECT COALESCE(SUM(display_status = 'Pending'), 0) AS pending,
              COALESCE(SUM(display_status = 'Due soon'), 0) AS due_soon,
              COALESCE(SUM(display_status = 'Overdue'), 0) AS overdue,
              COALESCE(SUM(display_status = 'Submitted'), 0) AS submitted
         FROM v_student_assignments WHERE student_id = ?`,
      [profileId]
    );
    const [[issues]] = await pool.query(
      "SELECT COUNT(*) AS open_issues FROM attendance_issues WHERE student_id = ? AND status = 'open'",
      [profileId]
    );
    data = { attendance: { ...att, minRequiredPercent: env.attendanceMinPercent }, assignments: asg, openIssues: issues.open_issues };
  } else if (role === 'lecturer') {
    const [[row]] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM teaching_assignments WHERE lecturer_id = ?) AS classes,
         (SELECT COUNT(*) FROM attendance_issues ai
            JOIN attendance_records ar ON ar.id = ai.attendance_record_id
            JOIN attendance_sessions ses ON ses.id = ar.session_id
            JOIN teaching_assignments ta ON ta.id = ses.teaching_assignment_id
           WHERE ta.lecturer_id = ? AND ai.status = 'open') AS open_issues,
         (SELECT COUNT(*) FROM assignments a JOIN teaching_assignments ta ON ta.id = a.teaching_assignment_id
           WHERE ta.lecturer_id = ? AND a.status = 'published') AS published_assignments,
         (SELECT COUNT(*) FROM assignment_submissions sb
            JOIN assignments a ON a.id = sb.assignment_id
            JOIN teaching_assignments ta ON ta.id = a.teaching_assignment_id
           WHERE ta.lecturer_id = ? AND sb.status = 'submitted' AND sb.marks IS NULL) AS awaiting_grading`,
      [profileId, profileId, profileId, profileId]
    );
    data = row;
  } else {
    const [[row]] = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM students WHERE status = 'active') AS active_students,
         (SELECT COUNT(*) FROM lecturers l JOIN users u ON u.id = l.user_id WHERE u.status = 'active') AS active_lecturers,
         (SELECT COUNT(*) FROM assignments WHERE status = 'published') AS published_assignments,
         (SELECT COUNT(*) FROM attendance_issues WHERE status = 'open') AS open_attendance_issues`
    );
    data = row;
  }
  res.json({ success: true, data: { role, unreadNotifications: unread.count, ...data } });
});
