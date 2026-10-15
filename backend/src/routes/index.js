const router = require('express').Router();

router.get('/health', (req, res) => res.json({ success: true, status: 'ok', time: new Date().toISOString() }));

router.use('/auth', require('../modules/auth/auth.routes'));
router.use('/admin', require('../modules/users/users.routes'));
router.use('/academic', require('../modules/academic/academic.routes'));
router.use('/teaching', require('../modules/teaching/teaching.routes'));
router.use('/timetables', require('../modules/timetable/timetable.routes'));
router.use('/attendance', require('../modules/attendance/attendance.routes'));
router.use('/assignments', require('../modules/assignments/assignments.routes'));
router.use('/materials', require('../modules/materials/materials.routes'));
router.use('/announcements', require('../modules/announcements/announcements.routes'));
router.use('/calendar', require('../modules/calendar/calendar.routes'));
router.use('/notifications', require('../modules/notifications/notifications.routes'));
router.use('/dashboard', require('../modules/dashboard/dashboard.routes'));
router.use('/files', require('../modules/files/files.routes'));

module.exports = router;
