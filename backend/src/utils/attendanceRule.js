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

// Same rule in JavaScript, for a list of statuses (null = no record for that class).
exports.summarize = (statuses) => {
  const list = statuses.filter(Boolean);
  const count = (...st) => list.filter((x) => st.includes(x)).length;
  const held = list.length - count('excused');
  const attended = count('present', 'late');
  return {
    total_classes: held,
    attended_classes: attended,
    absent_classes: count('absent'),
    excused_classes: count('excused'),
    attendance_percentage: held ? Math.round((attended / held) * 10000) / 100 : null,
  };
};

// How far a student is from the minimum, with the same rule (excused classes do not count).
//   toReach: classes in a row they must attend to reach the minimum (0 if already there)
//   canMiss: classes they can still miss and stay at or above the minimum (0 if below)
exports.margin = (attended, held, minPercent) => {
  const a = Number(attended) || 0;
  const h = Number(held) || 0;
  const m = Number(minPercent);
  if (!h || m <= 0) return { toReach: 0, canMiss: null };
  if (m >= 100) return { toReach: a < h ? null : 0, canMiss: 0 }; // 100% can never be regained after a miss
  const below = a * 100 < m * h;
  return {
    toReach: below ? Math.ceil((m * h - 100 * a) / (100 - m)) : 0,
    canMiss: below ? 0 : Math.floor((100 * a) / m - h + 1e-9),
  };
};
