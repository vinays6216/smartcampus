const env = require('../config/env');

// The approved attendance rule. The same formula is used by the database views and sp_attendance_report:
//   percentage = (present + late) / (classes held - excused) x 100
exports.attendanceRule = () => ({
  text: 'Attendance % = (Present + Late) ÷ (Classes held − Excused) × 100',
  attendedStatuses: ['present', 'late'],
  excludedStatuses: ['excused'],
  minRequiredPercent: env.attendanceMinPercent,
});

// SQL pieces for "ar" = attendance_records (NULL-safe for LEFT JOINs)
exports.RULE_SQL = {
  total: "COALESCE(SUM(ar.status <> 'excused'), 0)",
  attended: "COALESCE(SUM(ar.status IN ('present','late')), 0)",
  absent: "COALESCE(SUM(ar.status = 'absent'), 0)",
  percentage: "ROUND(100 * SUM(ar.status IN ('present','late')) / NULLIF(SUM(ar.status <> 'excused'), 0), 2)",
};
