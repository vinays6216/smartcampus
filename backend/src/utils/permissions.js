const { pool } = require('../config/db');

// Admin permissions (table admin_permissions, added by database/migrations/002_admin_permissions.sql).
// "platform" = platform admin: manages admins and may do everything.
const AREAS = {
  users: 'Students & lecturers',
  academic: 'Academic setup & teaching assignments',
  timetable: 'Timetables',
  attendance: 'Attendance (reports, issues, corrections, editing)',
  announcements: 'Announcements & calendar',
  assignments: 'Assignments & study materials',
};
const ALL = Object.keys(AREAS);

// -> { platform, permissions: [...areas], active, ready }
// ready = false when the migration has not been run: every admin then keeps full rights (the old behaviour).
async function adminAccess(adminId, conn = pool) {
  try {
    const [rows] = await conn.query(
      `SELECT ap.permission, u.status FROM admins a
         JOIN users u ON u.id = a.user_id
         LEFT JOIN admin_permissions ap ON ap.admin_id = a.id
        WHERE a.id = ?`,
      [adminId]
    );
    const active = rows.length > 0 && rows[0].status === 'active';
    const perms = rows.map((r) => r.permission).filter(Boolean);
    const platform = perms.includes('platform');
    return { platform, permissions: platform ? ALL : ALL.filter((p) => perms.includes(p)), active, ready: true };
  } catch (e) {
    if (e && e.code === 'ER_NO_SUCH_TABLE') return { platform: true, permissions: ALL, active: true, ready: false };
    throw e;
  }
}

module.exports = { AREAS, ALL, adminAccess };
