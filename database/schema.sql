-- =====================================================================
--  SMART CAMPUS MANAGEMENT SYSTEM  -  MySQL 8.0 schema
--  Run the whole script in MySQL Workbench (Ctrl+Shift+Enter).
-- =====================================================================

CREATE DATABASE IF NOT EXISTS smart_campus
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;

USE smart_campus;

SET FOREIGN_KEY_CHECKS = 0;

-- =====================================================================
-- 1. ACADEMIC STRUCTURE
-- =====================================================================

CREATE TABLE IF NOT EXISTS departments (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  code        VARCHAR(20)  NOT NULL,
  name        VARCHAR(150) NOT NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_departments_code (code)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS programs (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  department_id      INT UNSIGNED NOT NULL,
  code               VARCHAR(20)  NOT NULL,          -- e.g. MCA, MBA, BE-CSE
  name               VARCHAR(150) NOT NULL,
  duration_semesters TINYINT UNSIGNED NOT NULL DEFAULT 4,
  specialization_start_sem TINYINT UNSIGNED NULL,     -- e.g. 3 for MCA; NULL = program has no specializations
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_programs_code (code),
  CONSTRAINT fk_programs_department FOREIGN KEY (department_id)
    REFERENCES departments (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- Specializations of a program (MCA: WAD, Data Science, AIML). Chosen from the semester
-- stored in programs.specialization_start_sem.
CREATE TABLE IF NOT EXISTS specializations (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  program_id  INT UNSIGNED NOT NULL,
  code        VARCHAR(20)  NOT NULL,                  -- WAD, DS, AIML
  name        VARCHAR(150) NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_specializations_code (program_id, code),
  CONSTRAINT fk_spec_program FOREIGN KEY (program_id)
    REFERENCES programs (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS academic_years (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  label       VARCHAR(20)  NOT NULL,                 -- e.g. 2025-26
  start_date  DATE         NOT NULL,
  end_date    DATE         NOT NULL,
  is_current  TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uq_academic_years_label (label),
  CONSTRAINT chk_ay_dates CHECK (end_date > start_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sections (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  program_id       INT UNSIGNED NOT NULL,
  academic_year_id INT UNSIGNED NOT NULL,
  semester_no      TINYINT UNSIGNED NOT NULL,
  specialization_id INT UNSIGNED NULL,               -- NULL for common semesters (MCA sem 1-2), set from sem 3
  -- 0 when there is no specialization, so the unique key below also stops duplicate common sections
  specialization_key INT UNSIGNED GENERATED ALWAYS AS (IFNULL(specialization_id, 0)) STORED,
  name             VARCHAR(10)  NOT NULL,            -- A, B, C
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sections (program_id, academic_year_id, semester_no, specialization_key, name),
  CONSTRAINT fk_sections_program FOREIGN KEY (program_id)
    REFERENCES programs (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_sections_ay FOREIGN KEY (academic_year_id)
    REFERENCES academic_years (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  -- RESTRICT is required: MySQL does not allow CASCADE / SET NULL on the base column of a stored generated column
  CONSTRAINT fk_sections_spec FOREIGN KEY (specialization_id)
    REFERENCES specializations (id) ON DELETE RESTRICT ON UPDATE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS subjects (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  program_id  INT UNSIGNED NOT NULL,
  code        VARCHAR(20)  NOT NULL,
  name        VARCHAR(150) NOT NULL,
  semester_no TINYINT UNSIGNED NOT NULL,
  credits     TINYINT UNSIGNED NOT NULL DEFAULT 3,
  subject_type ENUM('theory','lab','elective','project') NOT NULL DEFAULT 'theory',
  specialization_id INT UNSIGNED NULL,               -- NULL = common subject, otherwise only for that specialization
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_subjects_code (program_id, code),
  KEY idx_subjects_spec (specialization_id),
  CONSTRAINT fk_subjects_program FOREIGN KEY (program_id)
    REFERENCES programs (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_subjects_spec FOREIGN KEY (specialization_id)
    REFERENCES specializations (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 2. USERS AND ROLE PROFILES
-- =====================================================================

CREATE TABLE IF NOT EXISTS users (
  id                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  email                VARCHAR(190) NOT NULL,
  password_hash        VARCHAR(255) NOT NULL,        -- bcrypt hash, never plain text
  role                 ENUM('admin','lecturer','student') NOT NULL,
  full_name            VARCHAR(150) NOT NULL,
  phone                VARCHAR(20)  NULL,
  status               ENUM('active','inactive','suspended') NOT NULL DEFAULT 'active',
  must_change_password TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at        DATETIME NULL,
  created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role_status (role, status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS admins (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       INT UNSIGNED NOT NULL,
  employee_code VARCHAR(30)  NOT NULL,
  designation   VARCHAR(100) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admins_user (user_id),
  UNIQUE KEY uq_admins_code (employee_code),
  CONSTRAINT fk_admins_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS lecturers (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id       INT UNSIGNED NOT NULL,
  employee_code VARCHAR(30)  NOT NULL,
  department_id INT UNSIGNED NOT NULL,
  designation   VARCHAR(100) NULL,                   -- Assistant Professor, etc.
  qualification VARCHAR(150) NULL,
  joined_on     DATE NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_lecturers_user (user_id),
  UNIQUE KEY uq_lecturers_code (employee_code),
  KEY idx_lecturers_department (department_id),
  CONSTRAINT fk_lecturers_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_lecturers_department FOREIGN KEY (department_id)
    REFERENCES departments (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS students (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id        INT UNSIGNED NOT NULL,
  usn            VARCHAR(20)  NOT NULL,              -- university seat number
  program_id     INT UNSIGNED NOT NULL,
  section_id     INT UNSIGNED NOT NULL,
  admission_year YEAR NULL,
  date_of_birth  DATE NULL,
  gender         ENUM('male','female','other') NULL,
  address        VARCHAR(255) NULL,
  guardian_name  VARCHAR(150) NULL,
  guardian_phone VARCHAR(20)  NULL,
  status         ENUM('active','passed_out','dropped','suspended') NOT NULL DEFAULT 'active',
  PRIMARY KEY (id),
  UNIQUE KEY uq_students_user (user_id),
  UNIQUE KEY uq_students_usn (usn),
  KEY idx_students_section (section_id, status),
  KEY idx_students_program (program_id),
  CONSTRAINT fk_students_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_students_program FOREIGN KEY (program_id)
    REFERENCES programs (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_students_section FOREIGN KEY (section_id)
    REFERENCES sections (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  token_hash  CHAR(64) NOT NULL,                     -- SHA-256 of the emailed token
  expires_at  DATETIME NOT NULL,
  used_at     DATETIME NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_prt_token (token_hash),
  KEY idx_prt_user (user_id),
  CONSTRAINT fk_prt_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 3. TEACHING MAP  (which lecturer teaches which subject to which section)
-- =====================================================================

CREATE TABLE IF NOT EXISTS teaching_assignments (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  lecturer_id INT UNSIGNED NOT NULL,
  subject_id  INT UNSIGNED NOT NULL,
  section_id  INT UNSIGNED NOT NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_teaching (lecturer_id, subject_id, section_id),
  KEY idx_teaching_section (section_id),
  KEY idx_teaching_subject (subject_id),
  CONSTRAINT fk_ta_lecturer FOREIGN KEY (lecturer_id)
    REFERENCES lecturers (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_ta_subject FOREIGN KEY (subject_id)
    REFERENCES subjects (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_ta_section FOREIGN KEY (section_id)
    REFERENCES sections (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 4. FILE STORE  (one row per uploaded file; disk path stored, not the file)
-- =====================================================================

CREATE TABLE IF NOT EXISTS files (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  original_name VARCHAR(255) NOT NULL,
  stored_name   VARCHAR(255) NOT NULL,
  file_path     VARCHAR(500) NOT NULL,
  extension     VARCHAR(10)  NOT NULL,
  mime_type     VARCHAR(120) NOT NULL,
  size_bytes    BIGINT UNSIGNED NOT NULL,
  uploaded_by   INT UNSIGNED NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_files_stored (stored_name),
  KEY idx_files_uploader (uploaded_by),
  CONSTRAINT fk_files_uploader FOREIGN KEY (uploaded_by)
    REFERENCES users (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 5. TIMETABLE  (admin uploads, students and lecturers view)
-- =====================================================================

CREATE TABLE IF NOT EXISTS timetables (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  section_id     INT UNSIGNED NOT NULL,
  title          VARCHAR(150) NOT NULL,
  file_id        INT UNSIGNED NOT NULL,
  effective_from DATE NOT NULL,
  effective_to   DATE NULL,
  is_active      TINYINT(1) NOT NULL DEFAULT 1,
  uploaded_by    INT UNSIGNED NOT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_timetables_section (section_id, is_active),
  CONSTRAINT fk_tt_section FOREIGN KEY (section_id)
    REFERENCES sections (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_tt_file FOREIGN KEY (file_id)
    REFERENCES files (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_tt_uploader FOREIGN KEY (uploaded_by)
    REFERENCES users (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 6. ATTENDANCE
-- =====================================================================

-- One row per class held (a lecturer marks attendance for a session)
CREATE TABLE IF NOT EXISTS attendance_sessions (
  id                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  teaching_assignment_id INT UNSIGNED NOT NULL,
  session_date           DATE NOT NULL,
  period_no              TINYINT UNSIGNED NOT NULL DEFAULT 1,
  start_time             TIME NULL,
  end_time               TIME NULL,
  topic                  VARCHAR(200) NULL,
  marked_by              INT UNSIGNED NOT NULL,      -- lecturers.id
  created_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_att_session (teaching_assignment_id, session_date, period_no),
  KEY idx_att_session_date (session_date),
  CONSTRAINT fk_attses_ta FOREIGN KEY (teaching_assignment_id)
    REFERENCES teaching_assignments (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_attses_lecturer FOREIGN KEY (marked_by)
    REFERENCES lecturers (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- One row per student per session
CREATE TABLE IF NOT EXISTS attendance_records (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id INT UNSIGNED NOT NULL,
  student_id INT UNSIGNED NOT NULL,
  status     ENUM('present','absent','late','excused') NOT NULL DEFAULT 'present',
  remarks    VARCHAR(255) NULL,
  marked_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_att_record (session_id, student_id),
  KEY idx_att_student_status (student_id, status),
  CONSTRAINT fk_attrec_session FOREIGN KEY (session_id)
    REFERENCES attendance_sessions (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_attrec_student FOREIGN KEY (student_id)
    REFERENCES students (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- Student raises an issue when wrongly marked absent
CREATE TABLE IF NOT EXISTS attendance_issues (
  id                   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  attendance_record_id BIGINT UNSIGNED NOT NULL,
  student_id           INT UNSIGNED NOT NULL,
  reason               VARCHAR(500) NOT NULL,
  proof_file_id        INT UNSIGNED NULL,
  status               ENUM('open','approved','rejected','withdrawn') NOT NULL DEFAULT 'open',
  resolved_by          INT UNSIGNED NULL,            -- lecturers.id
  resolution_remarks   VARCHAR(500) NULL,
  raised_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at          DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_issue_status (status, raised_at),
  KEY idx_issue_student (student_id),
  KEY idx_issue_record (attendance_record_id),
  CONSTRAINT fk_issue_record FOREIGN KEY (attendance_record_id)
    REFERENCES attendance_records (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_issue_student FOREIGN KEY (student_id)
    REFERENCES students (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_issue_proof FOREIGN KEY (proof_file_id)
    REFERENCES files (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_issue_resolver FOREIGN KEY (resolved_by)
    REFERENCES lecturers (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- History of every status change (filled automatically by a trigger below)
CREATE TABLE IF NOT EXISTS attendance_record_history (
  id                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  attendance_record_id BIGINT UNSIGNED NOT NULL,
  old_status           ENUM('present','absent','late','excused') NOT NULL,
  new_status           ENUM('present','absent','late','excused') NOT NULL,
  changed_by_user_id   INT UNSIGNED NULL,
  reason               VARCHAR(255) NULL,
  changed_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_arh_record (attendance_record_id),
  CONSTRAINT fk_arh_record FOREIGN KEY (attendance_record_id)
    REFERENCES attendance_records (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_arh_user FOREIGN KEY (changed_by_user_id)
    REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 7. ASSIGNMENTS
-- =====================================================================

CREATE TABLE IF NOT EXISTS assignments (
  id                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  teaching_assignment_id INT UNSIGNED NOT NULL,
  title                  VARCHAR(200) NOT NULL,
  description            TEXT NULL,
  max_marks              DECIMAL(6,2) NULL,
  deadline               DATETIME NOT NULL,
  allow_online           TINYINT(1) NOT NULL DEFAULT 1,   -- URL / PDF upload
  allow_manual           TINYINT(1) NOT NULL DEFAULT 1,   -- "I submitted in person" button
  allow_late             TINYINT(1) NOT NULL DEFAULT 0,
  status                 ENUM('draft','published','closed') NOT NULL DEFAULT 'draft',
  assigned_at            DATETIME NULL,
  created_by             INT UNSIGNED NOT NULL,           -- lecturers.id
  created_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_assign_ta (teaching_assignment_id, status),
  KEY idx_assign_deadline (deadline),
  CONSTRAINT fk_assign_ta FOREIGN KEY (teaching_assignment_id)
    REFERENCES teaching_assignments (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_assign_lecturer FOREIGN KEY (created_by)
    REFERENCES lecturers (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- Files the lecturer attaches to an assignment (question paper, etc.)
CREATE TABLE IF NOT EXISTS assignment_files (
  assignment_id INT UNSIGNED NOT NULL,
  file_id       INT UNSIGNED NOT NULL,
  PRIMARY KEY (assignment_id, file_id),
  CONSTRAINT fk_af_assignment FOREIGN KEY (assignment_id)
    REFERENCES assignments (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_af_file FOREIGN KEY (file_id)
    REFERENCES files (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- One row per student per assignment (created when the assignment is published)
CREATE TABLE IF NOT EXISTS assignment_submissions (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  assignment_id   INT UNSIGNED NOT NULL,
  student_id      INT UNSIGNED NOT NULL,
  status          ENUM('not_submitted','submitted') NOT NULL DEFAULT 'not_submitted',
  submission_mode ENUM('manual','online') NULL,
  submission_url  VARCHAR(500) NULL,
  remarks         VARCHAR(500) NULL,
  submitted_at    DATETIME NULL,
  is_late         TINYINT(1) NOT NULL DEFAULT 0,
  marks           DECIMAL(6,2) NULL,
  feedback        VARCHAR(500) NULL,
  graded_by       INT UNSIGNED NULL,                      -- lecturers.id
  graded_at       DATETIME NULL,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_submission (assignment_id, student_id),
  KEY idx_sub_student_status (student_id, status),
  CONSTRAINT fk_sub_assignment FOREIGN KEY (assignment_id)
    REFERENCES assignments (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_sub_student FOREIGN KEY (student_id)
    REFERENCES students (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_sub_grader FOREIGN KEY (graded_by)
    REFERENCES lecturers (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- PDFs uploaded by the student for a submission
CREATE TABLE IF NOT EXISTS submission_files (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  submission_id INT UNSIGNED NOT NULL,
  file_id       INT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_submission_file (submission_id, file_id),
  CONSTRAINT fk_sf_submission FOREIGN KEY (submission_id)
    REFERENCES assignment_submissions (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_sf_file FOREIGN KEY (file_id)
    REFERENCES files (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 8. STUDY MATERIALS
-- =====================================================================

CREATE TABLE IF NOT EXISTS study_materials (
  id                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  teaching_assignment_id INT UNSIGNED NOT NULL,
  title                  VARCHAR(200) NOT NULL,
  description            VARCHAR(500) NULL,
  unit_no                TINYINT UNSIGNED NULL,
  material_type          ENUM('pdf','ppt','doc','other') NOT NULL,
  file_id                INT UNSIGNED NOT NULL,
  uploaded_by            INT UNSIGNED NOT NULL,           -- lecturers.id
  is_active              TINYINT(1) NOT NULL DEFAULT 1,
  created_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sm_ta (teaching_assignment_id, is_active),
  CONSTRAINT fk_sm_ta FOREIGN KEY (teaching_assignment_id)
    REFERENCES teaching_assignments (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_sm_file FOREIGN KEY (file_id)
    REFERENCES files (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_sm_lecturer FOREIGN KEY (uploaded_by)
    REFERENCES lecturers (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
-- 9. ANNOUNCEMENTS AND CALENDAR
-- =====================================================================

CREATE TABLE IF NOT EXISTS announcements (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  title          VARCHAR(200) NOT NULL,
  body           TEXT NOT NULL,
  author_user_id INT UNSIGNED NOT NULL,
  audience_type  ENUM('all','students','lecturers','department','section') NOT NULL DEFAULT 'all',
  department_id  INT UNSIGNED NULL,                       -- when audience_type = 'department'
  section_id     INT UNSIGNED NULL,                       -- when audience_type = 'section'
  priority       ENUM('normal','important','urgent') NOT NULL DEFAULT 'normal',
  is_published   TINYINT(1) NOT NULL DEFAULT 1,
  publish_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at     DATETIME NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ann_audience (audience_type, section_id, department_id),
  KEY idx_ann_publish (publish_at),
  CONSTRAINT fk_ann_author FOREIGN KEY (author_user_id)
    REFERENCES users (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_ann_department FOREIGN KEY (department_id)
    REFERENCES departments (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_ann_section FOREIGN KEY (section_id)
    REFERENCES sections (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

-- Calendar entries (extra class, special class, exam, holiday...). Can be linked to an announcement.
CREATE TABLE IF NOT EXISTS calendar_events (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  announcement_id INT UNSIGNED NULL,
  title           VARCHAR(200) NOT NULL,
  description     VARCHAR(500) NULL,
  event_type      ENUM('extra_class','special_class','exam','holiday','event','other') NOT NULL DEFAULT 'extra_class',
  event_date      DATE NOT NULL,
  start_time      TIME NULL,
  end_time        TIME NULL,
  location        VARCHAR(150) NULL,
  section_id      INT UNSIGNED NULL,                      -- NULL = whole campus
  subject_id      INT UNSIGNED NULL,
  created_by      INT UNSIGNED NOT NULL,                  -- users.id
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cal_date (event_date),
  KEY idx_cal_section (section_id, event_date),
  CONSTRAINT fk_cal_announcement FOREIGN KEY (announcement_id)
    REFERENCES announcements (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_cal_section FOREIGN KEY (section_id)
    REFERENCES sections (id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_cal_subject FOREIGN KEY (subject_id)
    REFERENCES subjects (id) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_cal_creator FOREIGN KEY (created_by)
    REFERENCES users (id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_cal_time CHECK (end_time IS NULL OR start_time IS NULL OR end_time > start_time)
) ENGINE=InnoDB;

-- =====================================================================
-- 10. NOTIFICATIONS AND AUDIT
-- =====================================================================

CREATE TABLE IF NOT EXISTS notifications (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NOT NULL,
  type        ENUM('assignment_posted','deadline_reminder','attendance_issue_raised',
                   'attendance_issue_resolved','announcement','calendar_event',
                   'material_uploaded','timetable_updated','system') NOT NULL,
  title       VARCHAR(200) NOT NULL,
  message     VARCHAR(500) NULL,
  entity_type VARCHAR(40) NULL,                            -- 'assignment', 'announcement', ...
  entity_id   INT UNSIGNED NULL,
  is_read     TINYINT(1) NOT NULL DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at     DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_notif_user (user_id, is_read, created_at),
  KEY idx_notif_entity (entity_type, entity_id),
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED NULL,
  action      VARCHAR(60) NOT NULL,                        -- e.g. 'STUDENT_UPDATED'
  entity_type VARCHAR(40) NOT NULL,
  entity_id   INT UNSIGNED NULL,
  old_values  JSON NULL,
  new_values  JSON NULL,
  ip_address  VARCHAR(45) NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_audit_user (user_id, created_at),
  KEY idx_audit_entity (entity_type, entity_id),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id)
    REFERENCES users (id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================================================
-- 11. VIEWS
-- =====================================================================

-- Attendance percentage per student per subject.
-- Rule: present + late = attended; excused classes are left out of the total.
CREATE OR REPLACE VIEW v_student_subject_attendance AS
SELECT
  s.id   AS student_id,
  s.usn,
  u.full_name,
  ta.id  AS teaching_assignment_id,
  sub.code AS subject_code,
  sub.name AS subject_name,
  SUM(ar.status <> 'excused')                AS total_classes,
  SUM(ar.status IN ('present','late'))       AS attended_classes,
  SUM(ar.status = 'absent')                  AS absent_classes,
  ROUND(100 * SUM(ar.status IN ('present','late'))
        / NULLIF(SUM(ar.status <> 'excused'), 0), 2) AS attendance_percentage
FROM attendance_records ar
JOIN attendance_sessions ses ON ses.id = ar.session_id
JOIN teaching_assignments ta ON ta.id = ses.teaching_assignment_id
JOIN subjects sub            ON sub.id = ta.subject_id
JOIN students s              ON s.id = ar.student_id
JOIN users u                 ON u.id = s.user_id
GROUP BY s.id, s.usn, u.full_name, ta.id, sub.code, sub.name;

-- Day-by-day attendance for a student, with any issue already raised
CREATE OR REPLACE VIEW v_student_attendance_detail AS
SELECT
  ar.student_id,
  ses.session_date,
  ses.period_no,
  sub.code AS subject_code,
  sub.name AS subject_name,
  ar.id    AS attendance_record_id,
  ar.status,
  ai.id     AS issue_id,
  ai.status AS issue_status
FROM attendance_records ar
JOIN attendance_sessions ses ON ses.id = ar.session_id
JOIN teaching_assignments ta ON ta.id = ses.teaching_assignment_id
JOIN subjects sub            ON sub.id = ta.subject_id
LEFT JOIN attendance_issues ai ON ai.attendance_record_id = ar.id AND ai.status IN ('open','approved','rejected');

-- Assignment list for students with a computed display status
CREATE OR REPLACE VIEW v_student_assignments AS
SELECT
  sb.student_id,
  a.id AS assignment_id,
  a.title,
  sub.name AS subject_name,
  a.deadline,
  a.status AS assignment_status,
  sb.status AS submission_status,
  sb.submission_mode,
  sb.submitted_at,
  sb.marks,
  CASE
    WHEN sb.status = 'submitted'                         THEN 'Submitted'
    WHEN a.deadline < NOW()                              THEN 'Overdue'
    WHEN a.deadline <= DATE_ADD(NOW(), INTERVAL 24 HOUR) THEN 'Due soon'
    ELSE 'Pending'
  END AS display_status
FROM assignment_submissions sb
JOIN assignments a           ON a.id = sb.assignment_id
JOIN teaching_assignments ta ON ta.id = a.teaching_assignment_id
JOIN subjects sub            ON sub.id = ta.subject_id
WHERE a.status IN ('published','closed');

-- =====================================================================
-- 12. TRIGGER, STORED PROCEDURES, EVENT
-- =====================================================================

DELIMITER $$

-- Logs every attendance status change. The backend can set
--   SET @app_user_id = <user id>; SET @change_reason = '<text>';
-- before updating so the log shows who changed it and why.
DROP TRIGGER IF EXISTS trg_attendance_record_history$$
CREATE TRIGGER trg_attendance_record_history
AFTER UPDATE ON attendance_records
FOR EACH ROW
BEGIN
  IF OLD.status <> NEW.status THEN
    INSERT INTO attendance_record_history
      (attendance_record_id, old_status, new_status, changed_by_user_id, reason)
    VALUES
      (OLD.id, OLD.status, NEW.status, @app_user_id, @change_reason);
  END IF;
END$$

-- Lecturer report: attendance % between two dates, optionally only students below a given %
-- Example: CALL sp_attendance_report(1, '2026-08-01', '2026-10-14', 75);
-- Pass NULL as the last argument to list everyone.
DROP PROCEDURE IF EXISTS sp_attendance_report$$
CREATE PROCEDURE sp_attendance_report(
  IN p_teaching_assignment_id INT UNSIGNED,
  IN p_from_date DATE,
  IN p_to_date   DATE,
  IN p_below_percent DECIMAL(5,2)
)
BEGIN
  SELECT
    s.id AS student_id,
    s.usn,
    u.full_name,
    SUM(ar.status <> 'excused')            AS total_classes,
    SUM(ar.status IN ('present','late'))   AS attended_classes,
    SUM(ar.status = 'absent')              AS absent_classes,
    ROUND(100 * SUM(ar.status IN ('present','late'))
          / NULLIF(SUM(ar.status <> 'excused'), 0), 2) AS attendance_percentage
  FROM attendance_sessions ses
  JOIN attendance_records ar ON ar.session_id = ses.id
  JOIN students s            ON s.id = ar.student_id
  JOIN users u               ON u.id = s.user_id
  WHERE ses.teaching_assignment_id = p_teaching_assignment_id
    AND ses.session_date BETWEEN p_from_date AND p_to_date
  GROUP BY s.id, s.usn, u.full_name
  HAVING p_below_percent IS NULL OR attendance_percentage < p_below_percent
  ORDER BY attendance_percentage ASC, s.usn ASC;
END$$

-- Publishing an assignment: marks it published, creates a "not submitted"
-- row for every active student of the section, and sends each a notification.
DROP PROCEDURE IF EXISTS sp_publish_assignment$$
CREATE PROCEDURE sp_publish_assignment(IN p_assignment_id INT UNSIGNED)
BEGIN
  DECLARE v_section_id INT UNSIGNED;
  DECLARE v_title VARCHAR(200);

  SELECT ta.section_id, a.title
    INTO v_section_id, v_title
  FROM assignments a
  JOIN teaching_assignments ta ON ta.id = a.teaching_assignment_id
  WHERE a.id = p_assignment_id;

  START TRANSACTION;

  UPDATE assignments
     SET status = 'published', assigned_at = NOW()
   WHERE id = p_assignment_id;

  INSERT IGNORE INTO assignment_submissions (assignment_id, student_id, status)
  SELECT p_assignment_id, s.id, 'not_submitted'
  FROM students s
  WHERE s.section_id = v_section_id AND s.status = 'active';

  INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
  SELECT s.user_id, 'assignment_posted', 'New assignment posted', v_title, 'assignment', p_assignment_id
  FROM students s
  WHERE s.section_id = v_section_id AND s.status = 'active';

  COMMIT;
END$$

-- Creates one reminder per student for assignments due within 24 hours
-- that are still not submitted. Safe to run repeatedly (no duplicates).
DROP PROCEDURE IF EXISTS sp_create_deadline_reminders$$
CREATE PROCEDURE sp_create_deadline_reminders()
BEGIN
  INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
  SELECT
    s.user_id,
    'deadline_reminder',
    CONCAT('Deadline soon: ', a.title),
    CONCAT('Due on ', DATE_FORMAT(a.deadline, '%d %b %Y, %h:%i %p')),
    'assignment',
    a.id
  FROM assignments a
  JOIN assignment_submissions sb ON sb.assignment_id = a.id AND sb.status = 'not_submitted'
  JOIN students s ON s.id = sb.student_id
  WHERE a.status = 'published'
    AND a.deadline > NOW()
    AND a.deadline <= DATE_ADD(NOW(), INTERVAL 24 HOUR)
    AND NOT EXISTS (
      SELECT 1 FROM notifications n
      WHERE n.user_id = s.user_id
        AND n.type = 'deadline_reminder'
        AND n.entity_type = 'assignment'
        AND n.entity_id = a.id
    );
END$$

DELIMITER ;

-- Runs the reminder procedure every hour.
-- Needs the scheduler on:  SET GLOBAL event_scheduler = ON;  (run once, as root)
DROP EVENT IF EXISTS ev_deadline_reminders;
CREATE EVENT ev_deadline_reminders
  ON SCHEDULE EVERY 1 HOUR
  DO CALL sp_create_deadline_reminders();

-- =====================================================================
-- 13. STARTER DATA
-- =====================================================================

INSERT INTO departments (code, name)
VALUES ('CS', 'Computer Science and Applications')
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO programs (department_id, code, name, duration_semesters, specialization_start_sem)
SELECT id, 'MCA', 'Master of Computer Applications', 4, 3 FROM departments WHERE code = 'CS'
ON DUPLICATE KEY UPDATE name = VALUES(name), specialization_start_sem = VALUES(specialization_start_sem);

-- MCA specializations (chosen in the 3rd semester)
INSERT INTO specializations (program_id, code, name)
SELECT id, 'WAD', 'Web Application Development' FROM programs WHERE code = 'MCA'
ON DUPLICATE KEY UPDATE name = VALUES(name);
INSERT INTO specializations (program_id, code, name)
SELECT id, 'DS', 'Data Science' FROM programs WHERE code = 'MCA'
ON DUPLICATE KEY UPDATE name = VALUES(name);
INSERT INTO specializations (program_id, code, name)
SELECT id, 'AIML', 'Artificial Intelligence and Machine Learning' FROM programs WHERE code = 'MCA'
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO academic_years (label, start_date, end_date, is_current)
VALUES ('2026-27', '2026-08-01', '2027-07-31', 1)
ON DUPLICATE KEY UPDATE is_current = VALUES(is_current);

-- First admin. Replace the hash with a real bcrypt hash generated by your backend
-- before logging in; the placeholder below will not match any password.
INSERT INTO users (email, password_hash, role, full_name, must_change_password)
VALUES ('admin@smartcampus.local', 'REPLACE_WITH_BCRYPT_HASH', 'admin', 'System Admin', 1)
ON DUPLICATE KEY UPDATE full_name = VALUES(full_name);

INSERT INTO admins (user_id, employee_code, designation)
SELECT id, 'ADM001', 'Administrator' FROM users WHERE email = 'admin@smartcampus.local'
ON DUPLICATE KEY UPDATE designation = VALUES(designation);

-- =====================================================================
-- END
-- =====================================================================
