const { pool } = require('../config/db');
const ApiError = require('./ApiError');

// Lecturers may only work on their own teaching assignments. Admins pass.
exports.assertTeaches = async (user, teachingAssignmentId, conn = pool) => {
  if (user.role === 'admin') return;
  const [rows] = await conn.query(
    'SELECT id FROM teaching_assignments WHERE id = ? AND lecturer_id = ?',
    [teachingAssignmentId, user.profileId]
  );
  if (!rows.length) throw new ApiError(403, 'You do not teach this subject for this section');
};

exports.assertTeachesSection = async (user, sectionId, conn = pool) => {
  if (user.role === 'admin') return;
  const [rows] = await conn.query(
    'SELECT id FROM teaching_assignments WHERE section_id = ? AND lecturer_id = ? LIMIT 1',
    [sectionId, user.profileId]
  );
  if (!rows.length) throw new ApiError(403, 'You do not teach this section');
};
