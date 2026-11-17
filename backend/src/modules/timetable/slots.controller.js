const { pool } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');
const { getStudent } = require('../../utils/profile');

// Weekly timetable grid (table timetable_slots, added by database/migrations/001_timetable_slots.sql).
// If the migration has not been run yet, answer with a clear message instead of a 500.
const needsMigration = (fn) => asyncHandler(async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (e) {
    if (e && e.code === 'ER_NO_SUCH_TABLE') {
      throw new ApiError(503, 'Weekly timetable is not set up yet: run database/migrations/001_timetable_slots.sql');
    }
    throw e;
  }
});

const SELECT = `
  SELECT sl.id, sl.section_id, sl.teaching_assignment_id, sl.day_of_week, sl.period_no,
         sl.start_time, sl.end_time, sl.room,
         sub.code AS subject_code, sub.name AS subject_name,
         lu.full_name AS lecturer_name, sec.name AS section_name, sec.semester_no, p.code AS program_code
    FROM timetable_slots sl
    JOIN teaching_assignments ta ON ta.id = sl.teaching_assignment_id
    JOIN subjects sub  ON sub.id = ta.subject_id
    JOIN lecturers l   ON l.id = ta.lecturer_id
    JOIN users lu      ON lu.id = l.user_id
    JOIN sections sec  ON sec.id = sl.section_id
    JOIN programs p    ON p.id = sec.program_id`;

// Student: own section. Lecturer: own classes (all sections). Admin: one section (?sectionId) or all.
exports.list = needsMigration(async (req, res) => {
  const where = ['1=1'];
  const params = [];
  const { role, profileId } = req.user;
  if (role === 'student') {
    const student = await getStudent(profileId);
    where.push('sl.section_id = ?'); params.push(student.section_id);
  } else if (role === 'lecturer') {
    where.push('ta.lecturer_id = ?'); params.push(profileId);
  } else if (req.query.sectionId) {
    where.push('sl.section_id = ?'); params.push(req.query.sectionId);
  }
  const [rows] = await pool.query(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY sl.day_of_week, sl.period_no, sec.name`, params);
  res.json({ success: true, data: rows });
});

// Shared checks for create / edit. Returns the section of the teaching assignment.
async function check(b, ignoreId = 0) {
  if (b.endTime <= b.startTime) throw new ApiError(400, 'End time must be after start time');
  const [[ta]] = await pool.query('SELECT id, section_id, lecturer_id FROM teaching_assignments WHERE id = ?', [b.teachingAssignmentId]);
  if (!ta) throw new ApiError(400, 'Teaching assignment does not exist');

  const [[taken]] = await pool.query(
    'SELECT id FROM timetable_slots WHERE section_id = ? AND day_of_week = ? AND period_no = ? AND id <> ?',
    [ta.section_id, b.dayOfWeek, b.periodNo, ignoreId]
  );
  if (taken) throw new ApiError(409, 'This section already has a class in that period');

  // the same lecturer cannot teach two sections at overlapping times on the same day
  const [[clash]] = await pool.query(
    `SELECT sl.id, sec.name AS section_name, sl.start_time, sl.end_time
       FROM timetable_slots sl
       JOIN teaching_assignments ta ON ta.id = sl.teaching_assignment_id
       JOIN sections sec ON sec.id = sl.section_id
      WHERE ta.lecturer_id = ? AND sl.day_of_week = ? AND sl.id <> ?
        AND sl.start_time < ? AND sl.end_time > ?
      LIMIT 1`,
    [ta.lecturer_id, b.dayOfWeek, ignoreId, b.endTime, b.startTime]
  );
  if (clash) {
    throw new ApiError(409, `The lecturer already teaches section ${clash.section_name} at ${clash.start_time.slice(0, 5)}–${clash.end_time.slice(0, 5)} that day`);
  }
  return ta.section_id;
}

exports.create = needsMigration(async (req, res) => {
  const b = req.body;
  const sectionId = await check(b);
  const [r] = await pool.query(
    `INSERT INTO timetable_slots (section_id, teaching_assignment_id, day_of_week, period_no, start_time, end_time, room, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [sectionId, b.teachingAssignmentId, b.dayOfWeek, b.periodNo, b.startTime, b.endTime, b.room || null, req.user.id]
  );
  res.status(201).json({ success: true, data: { id: r.insertId } });
});

exports.update = needsMigration(async (req, res) => {
  const [[slot]] = await pool.query('SELECT id FROM timetable_slots WHERE id = ?', [req.params.id]);
  if (!slot) throw new ApiError(404, 'Timetable slot not found');
  const b = req.body;
  const sectionId = await check(b, slot.id);
  await pool.query(
    `UPDATE timetable_slots SET section_id = ?, teaching_assignment_id = ?, day_of_week = ?, period_no = ?,
            start_time = ?, end_time = ?, room = ? WHERE id = ?`,
    [sectionId, b.teachingAssignmentId, b.dayOfWeek, b.periodNo, b.startTime, b.endTime, b.room || null, slot.id]
  );
  res.json({ success: true, message: 'Timetable slot updated' });
});

exports.remove = needsMigration(async (req, res) => {
  const [r] = await pool.query('DELETE FROM timetable_slots WHERE id = ?', [req.params.id]);
  if (!r.affectedRows) throw new ApiError(404, 'Timetable slot not found');
  res.json({ success: true, message: 'Timetable slot deleted' });
});
