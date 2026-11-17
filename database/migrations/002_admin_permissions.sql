-- Migration 002: platform admin + per-admin permissions.
-- Additive only: creates one new table; nothing existing is changed. Safe to run more than once.
-- Run as a MySQL user that can CREATE tables:  mysql -u root -p smart_campus < database/migrations/002_admin_permissions.sql
--
-- Permissions:
--   platform      platform admin: manages admin accounts and their permissions, and may do everything
--   users         students & lecturers (create, edit, status, passwords, CSV import)
--   academic      academic setup (departments, programs, years, sections, subjects) and teaching assignments
--   timetable     timetable files and the weekly grid
--   attendance    attendance reports, register, issues, corrections, editing and deleting classes
--   announcements announcements and calendar events
--   assignments   assignments and study materials

USE smart_campus;

CREATE TABLE IF NOT EXISTS admin_permissions (
  admin_id   INT UNSIGNED NOT NULL,
  permission VARCHAR(30)  NOT NULL,
  granted_by INT UNSIGNED NULL,                 -- users.id of the platform admin who granted it
  granted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (admin_id, permission),
  CONSTRAINT chk_admin_permission CHECK (permission IN
    ('platform','users','academic','timetable','attendance','announcements','assignments')),
  CONSTRAINT fk_adperm_admin FOREIGN KEY (admin_id)
    REFERENCES admins (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_adperm_granter FOREIGN KEY (granted_by)
    REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- Starting values, only on the first run (when the table is still empty), so later changes are never undone.
SET @first_run := (SELECT COUNT(*) = 0 FROM admin_permissions);

-- 1. The starter admin (admin@smartcampus.local) becomes the platform admin ...
INSERT IGNORE INTO admin_permissions (admin_id, permission)
SELECT a.id, 'platform' FROM admins a JOIN users u ON u.id = a.user_id
 WHERE @first_run AND u.email = 'admin@smartcampus.local';

-- ... or, if that account does not exist, the oldest admin.
INSERT IGNORE INTO admin_permissions (admin_id, permission)
SELECT MIN(a.id), 'platform' FROM admins a
 WHERE @first_run AND NOT EXISTS (SELECT 1 FROM admin_permissions WHERE permission = 'platform')
HAVING MIN(a.id) IS NOT NULL;

-- 2. Every other existing admin keeps the full rights they had before.
INSERT IGNORE INTO admin_permissions (admin_id, permission)
SELECT a.id, p.permission
  FROM admins a
  CROSS JOIN (SELECT 'users' AS permission UNION ALL SELECT 'academic' UNION ALL SELECT 'timetable'
              UNION ALL SELECT 'attendance' UNION ALL SELECT 'announcements' UNION ALL SELECT 'assignments') p
 WHERE @first_run AND NOT EXISTS (SELECT 1 FROM admin_permissions x WHERE x.admin_id = a.id);
