// Helpers that write rows into `notifications`.

async function notifyUsers(conn, userIds, { type, title, message = null, entityType = null, entityId = null }) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (!ids.length) return;
  const rows = ids.map((uid) => [uid, type, title, message, entityType, entityId]);
  await conn.query(
    'INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id) VALUES ?',
    [rows]
  );
}

async function sectionStudentUserIds(conn, sectionId) {
  const [rows] = await conn.query(
    "SELECT user_id FROM students WHERE section_id = ? AND status = 'active'",
    [sectionId]
  );
  return rows.map((r) => r.user_id);
}

async function sectionLecturerUserIds(conn, sectionId) {
  const [rows] = await conn.query(
    `SELECT DISTINCT l.user_id FROM teaching_assignments ta
       JOIN lecturers l ON l.id = ta.lecturer_id WHERE ta.section_id = ?`,
    [sectionId]
  );
  return rows.map((r) => r.user_id);
}

// Who should receive an announcement for the given audience?
async function audienceUserIds(conn, { audienceType, departmentId, sectionId }) {
  let rows;
  switch (audienceType) {
    case 'all':
      [rows] = await conn.query("SELECT id AS user_id FROM users WHERE status = 'active'");
      return rows.map((r) => r.user_id);
    case 'students':
      [rows] = await conn.query("SELECT id AS user_id FROM users WHERE role = 'student' AND status = 'active'");
      return rows.map((r) => r.user_id);
    case 'lecturers':
      [rows] = await conn.query("SELECT id AS user_id FROM users WHERE role = 'lecturer' AND status = 'active'");
      return rows.map((r) => r.user_id);
    case 'department': {
      const [students] = await conn.query(
        `SELECT s.user_id FROM students s JOIN programs p ON p.id = s.program_id
          WHERE p.department_id = ? AND s.status = 'active'`,
        [departmentId]
      );
      const [lecturers] = await conn.query('SELECT user_id FROM lecturers WHERE department_id = ?', [departmentId]);
      return [...students, ...lecturers].map((r) => r.user_id);
    }
    case 'section':
      return [
        ...(await sectionStudentUserIds(conn, sectionId)),
        ...(await sectionLecturerUserIds(conn, sectionId)),
      ];
    default:
      return [];
  }
}

module.exports = { notifyUsers, sectionStudentUserIds, sectionLecturerUserIds, audienceUserIds };
