-- Migration 001: structured weekly timetable (one row per class period).
-- Additive only: creates a new table; nothing existing is changed. Safe to run more than once.
-- Run as a MySQL user that can CREATE tables, e.g.:  mysql -u root -p smart_campus < database/migrations/001_timetable_slots.sql
-- The app user only needs SELECT/INSERT/UPDATE/DELETE on it (already covered by GRANT ... ON smart_campus.*).

USE smart_campus;

CREATE TABLE IF NOT EXISTS timetable_slots (
  id                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  section_id             INT UNSIGNED NOT NULL,           -- copy of the teaching assignment's section (for the unique key)
  teaching_assignment_id INT UNSIGNED NOT NULL,           -- subject + lecturer + section
  day_of_week            TINYINT UNSIGNED NOT NULL,       -- 1 = Monday ... 7 = Sunday
  period_no              TINYINT UNSIGNED NOT NULL,
  start_time             TIME NOT NULL,
  end_time               TIME NOT NULL,
  room                   VARCHAR(50) NULL,
  created_by             INT UNSIGNED NULL,
  created_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_slot_section_period (section_id, day_of_week, period_no),
  KEY idx_slot_ta (teaching_assignment_id),
  CONSTRAINT chk_slot_day CHECK (day_of_week BETWEEN 1 AND 7),
  CONSTRAINT chk_slot_period CHECK (period_no BETWEEN 1 AND 12),
  CONSTRAINT chk_slot_times CHECK (end_time > start_time),
  CONSTRAINT fk_slot_section FOREIGN KEY (section_id)
    REFERENCES sections (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_slot_ta FOREIGN KEY (teaching_assignment_id)
    REFERENCES teaching_assignments (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_slot_creator FOREIGN KEY (created_by)
    REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;
