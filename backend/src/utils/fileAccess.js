const { pool } = require('../config/db');
const { getStudent } = require('./profile');

// Decides whether a logged-in user may download a given file.
// Admin: always. Uploader: always. Student / lecturer: only files that belong to their own section / classes.
module.exports = async function canAccessFile(user, file) {
  if (user.role === 'admin' || file.uploaded_by === user.id) return true;

  if (user.role === 'student') {
    const student = await getStudent(user.profileId);
    const [rows] = await pool.query(
      `SELECT 1 FROM study_materials sm
         JOIN teaching_assignments ta ON ta.id = sm.teaching_assignment_id
        WHERE sm.file_id = ? AND sm.is_active = 1 AND ta.section_id = ?
       UNION ALL
       SELECT 1 FROM timetables t WHERE t.file_id = ? AND t.section_id = ?
       UNION ALL
       SELECT 1 FROM assignment_files af
         JOIN assignments a ON a.id = af.assignment_id
         JOIN teaching_assignments ta ON ta.id = a.teaching_assignment_id
        WHERE af.file_id = ? AND a.status IN ('published','closed') AND ta.section_id = ?
       UNION ALL
       SELECT 1 FROM submission_files sf
         JOIN assignment_submissions sb ON sb.id = sf.submission_id
        WHERE sf.file_id = ? AND sb.student_id = ?
       UNION ALL
       SELECT 1 FROM attendance_issues ai WHERE ai.proof_file_id = ? AND ai.student_id = ?
       LIMIT 1`,
      [file.id, student.section_id, file.id, student.section_id, file.id, student.section_id,
       file.id, student.id, file.id, student.id]
    );
    return rows.length > 0;
  }

  if (user.role === 'lecturer') {
    const [rows] = await pool.query(
      `SELECT 1 FROM study_materials sm
         JOIN teaching_assignments ta ON ta.id = sm.teaching_assignment_id
        WHERE sm.file_id = ? AND ta.lecturer_id = ?
       UNION ALL
       SELECT 1 FROM timetables t
        WHERE t.file_id = ? AND t.section_id IN (SELECT section_id FROM teaching_assignments WHERE lecturer_id = ?)
       UNION ALL
       SELECT 1 FROM assignment_files af
         JOIN assignments a ON a.id = af.assignment_id
         JOIN teaching_assignments ta ON ta.id = a.teaching_assignment_id
        WHERE af.file_id = ? AND ta.lecturer_id = ?
       UNION ALL
       SELECT 1 FROM submission_files sf
         JOIN assignment_submissions sb ON sb.id = sf.submission_id
         JOIN assignments a ON a.id = sb.assignment_id
         JOIN teaching_assignments ta ON ta.id = a.teaching_assignment_id
        WHERE sf.file_id = ? AND ta.lecturer_id = ?
       UNION ALL
       SELECT 1 FROM attendance_issues ai
         JOIN attendance_records ar ON ar.id = ai.attendance_record_id
         JOIN attendance_sessions ses ON ses.id = ar.session_id
         JOIN teaching_assignments ta ON ta.id = ses.teaching_assignment_id
        WHERE ai.proof_file_id = ? AND ta.lecturer_id = ?
       LIMIT 1`,
      [file.id, user.profileId, file.id, user.profileId, file.id, user.profileId,
       file.id, user.profileId, file.id, user.profileId]
    );
    return rows.length > 0;
  }

  return false;
};
