-- Migration 004: internal marks (tests, quizzes, labs ... per class).
-- Additive only: creates two new tables; nothing existing is changed. Safe to run more than once.
-- Run as a MySQL user that can CREATE tables:  mysql -u root -p smart_campus < database/migrations/004_internal_marks.sql
--
-- A lecturer creates an assessment for a class (teaching assignment), enters marks per student, then publishes it.
-- Students see only published assessments. Admins need the "assignments" permission (assignments, materials & marks).

USE smart_campus;

CREATE TABLE IF NOT EXISTS assessments (
  id                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  teaching_assignment_id INT UNSIGNED NOT NULL,
  title                  VARCHAR(100) NOT NULL,               -- e.g. "IA-1", "Quiz 2"
  kind                   ENUM('test','quiz','assignment','lab','other') NOT NULL DEFAULT 'test',
  max_marks              DECIMAL(6,2) NOT NULL,
  held_on                DATE NULL,
  is_published           TINYINT(1) NOT NULL DEFAULT 0,
  published_at           DATETIME NULL,
  created_by             INT UNSIGNED NULL,                   -- users.id
  created_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_assessment_title (teaching_assignment_id, title),
  CONSTRAINT chk_assessment_max CHECK (max_marks > 0),
  CONSTRAINT fk_assessment_ta FOREIGN KEY (teaching_assignment_id)
    REFERENCES teaching_assignments (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_assessment_creator FOREIGN KEY (created_by)
    REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS assessment_marks (
  assessment_id INT UNSIGNED NOT NULL,
  student_id    INT UNSIGNED NOT NULL,
  marks         DECIMAL(6,2) NULL,                            -- NULL = not entered (or absent)
  is_absent     TINYINT(1) NOT NULL DEFAULT 0,
  remarks       VARCHAR(255) NULL,
  updated_by    INT UNSIGNED NULL,                            -- users.id
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (assessment_id, student_id),
  KEY idx_marks_student (student_id),
  CONSTRAINT chk_marks_nonneg CHECK (marks IS NULL OR marks >= 0),
  CONSTRAINT fk_marks_assessment FOREIGN KEY (assessment_id)
    REFERENCES assessments (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_marks_student FOREIGN KEY (student_id)
    REFERENCES students (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_marks_updater FOREIGN KEY (updated_by)
    REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;
