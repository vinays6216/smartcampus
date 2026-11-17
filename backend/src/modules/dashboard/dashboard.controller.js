const env = require('../../config/env');
const { pool } = require('../../config/db');
const asyncHandler = require('../../utils/asyncHandler');
const { getStudent } = require('../../utils/profile');

// Next 7 days for the dashboard: calendar events the user can see + assignment deadlines.
// Student: own section's events + own unsubmitted assignments. Lecturer: campus + taught sections + own events,
// and own published assignments. Admin: everything.
exports.upcoming = asyncHandler(async (req, res) => {
  const { role, profileId, id: userId } = req.user;
  const evWhere = ['ce.event_date BETWEEN CURDATE() AND CURDATE() + INTERVAL 6 DAY'];
  const evParams = [];
  if (role === 'student') {
    const s = await getStudent(profileId);
    evWhere.push('(ce.section_id IS NULL OR ce.section_id = ?)');
    evParams.push(s.section_id);
  } else if (role === 'lecturer') {
    evWhere.push('(ce.section_id IS NULL OR ce.created_by = ? OR ce.section_id IN (SELECT section_id FROM teaching_assignments WHERE lecturer_id = ?))');
    evParams.push(userId, profileId);
  }
  const [events] = await pool.query(
    `SELECT ce.id, ce.title, ce.event_type, ce.event_date, ce.start_time, ce.end_time, ce.location, sec.name AS section_name
       FROM calendar_events ce LEFT JOIN sections sec ON sec.id = ce.section_id
      WHERE ${evWhere.join(' AND ')}
      ORDER BY ce.event_date, ce.start_time LIMIT 20`,
    evParams
  );

  let deadlines;
  if (role === 'student') {
    [deadlines] = await pool.query(
      `SELECT assignment_id AS id, title, subject_name, deadline, display_status
         FROM v_student_assignments
        WHERE student_id = ? AND assignment_status = 'published' AND submission_status = 'not_submitted'
          AND deadline BETWEEN NOW() AND NOW() + INTERVAL 7 DAY
        ORDER BY deadline LIMIT 20`,
      [profileId]
    );
  } else {
    const where = ["a.status = 'published'", 'a.deadline BETWEEN NOW() AND NOW() + INTERVAL 7 DAY'];
    const params = [];
    if (role === 'lecturer') { where.push('ta.lecturer_id = ?'); params.push(profileId); }
    [deadlines] = await pool.query(
      `SELECT a.id, a.title, sub.name AS subject_name, sec.name AS section_name, a.deadline,
              (SELECT COUNT(*) FROM assignment_submissions x WHERE x.assignment_id = a.id AND x.status = 'submitted') AS submitted_count,
              (SELECT COUNT(*) FROM assignment_submissions x WHERE x.assignment_id = a.id) AS total_students
         FROM assignments a
         JOIN teaching_assignments ta ON ta.id = a.teaching_assignment_id
         JOIN subjects sub ON sub.id = ta.subject_id
         JOIN sections sec ON sec.id = ta.section_id
        WHERE ${where.join(' AND ')}
        ORDER BY a.deadline LIMIT 20`,
      params
    );
  }
  res.json({ success: true, data: { events, deadlines } });
});

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
      `SELECT COALESCE(SUM(display_status = 'Pending' COLLATE utf8mb4_0900_ai_ci), 0) AS pending,
              COALESCE(SUM(display_status = 'Due soon' COLLATE utf8mb4_0900_ai_ci), 0) AS due_soon,
              COALESCE(SUM(display_status = 'Overdue' COLLATE utf8mb4_0900_ai_ci), 0) AS overdue,
              COALESCE(SUM(display_status = 'Submitted' COLLATE utf8mb4_0900_ai_ci), 0) AS submitted
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
