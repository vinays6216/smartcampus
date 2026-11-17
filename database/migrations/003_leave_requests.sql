-- Migration 003: student leave requests.
-- Additive only: creates one new table; nothing existing is changed. Safe to run more than once.
-- Run as a MySQL user that can CREATE tables:  mysql -u root -p smart_campus < database/migrations/003_leave_requests.sql
--
-- A student asks for leave for a date range (optional PDF/image proof). A lecturer of the student's section or an admin
-- with the attendance permission decides. When approved, the student's "absent" marks in that range become "excused"
-- (logged in attendance_record_history), and classes marked later in the range start as "excused" for that student.

USE smart_campus;

CREATE TABLE IF NOT EXISTS leave_requests (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_id    INT UNSIGNED NOT NULL,
  from_date     DATE NOT NULL,
  to_date       DATE NOT NULL,
  leave_type    ENUM('medical','personal','event','other') NOT NULL DEFAULT 'personal',
  reason        VARCHAR(500) NOT NULL,
  proof_file_id INT UNSIGNED NULL,
  status        ENUM('open','approved','rejected','withdrawn') NOT NULL DEFAULT 'open',
  decided_by    INT UNSIGNED NULL,                 -- users.id of the lecturer / admin who decided
  decided_at    DATETIME NULL,
  remarks       VARCHAR(500) NULL,
  excused_count INT UNSIGNED NOT NULL DEFAULT 0,   -- absent marks turned into excused at approval
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_leave_student (student_id, status),
  KEY idx_leave_status (status, from_date),
  CONSTRAINT chk_leave_dates CHECK (to_date >= from_date),
  CONSTRAINT fk_leave_student FOREIGN KEY (student_id)
    REFERENCES students (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_leave_proof FOREIGN KEY (proof_file_id)
    REFERENCES files (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_leave_decider FOREIGN KEY (decided_by)
    REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;
