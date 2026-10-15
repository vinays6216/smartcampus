const { pool } = require('../config/db');
const ApiError = require('./ApiError');

const PROFILE_TABLE = { student: 'students', lecturer: 'lecturers', admin: 'admins' };

// users.id + role -> students.id / lecturers.id / admins.id
exports.getProfileId = async (userId, role) => {
  const [rows] = await pool.query(`SELECT id FROM ${PROFILE_TABLE[role]} WHERE user_id = ?`, [userId]);
  return rows[0] ? rows[0].id : null;
};

exports.getStudent = async (studentId) => {
  const [rows] = await pool.query(
    `SELECT s.id, s.user_id, s.usn, s.section_id, s.program_id, p.department_id
       FROM students s JOIN programs p ON p.id = s.program_id
      WHERE s.id = ?`,
    [studentId]
  );
  if (!rows[0]) throw new ApiError(404, 'Student profile not found');
  return rows[0];
};
