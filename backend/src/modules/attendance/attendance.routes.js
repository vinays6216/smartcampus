const router = require('express').Router();
const { z, id, dateStr, timeStr, idParam } = require('../../utils/zodHelpers');
const validate = require('../../middleware/validate');
const upload = require('../../middleware/upload');
const { authenticate, authorize } = require('../../middleware/auth');
const c = require('./attendance.controller');

router.use(authenticate);

const status = z.enum(['present', 'absent', 'late', 'excused']);
const record = z.object({ studentId: id, status, remarks: z.string().trim().max(255).optional() });

// ---------------- Student ----------------
router.get('/student/summary', authorize('student'), c.mySummary);

router.get('/student/detail', authorize('student'), validate({
  query: z.object({ from: dateStr.optional(), to: dateStr.optional(), subjectCode: z.string().optional(), status: status.optional() }),
}), c.myDetail);

// multipart/form-data: attendanceRecordId, reason, optional file "proof"
router.post('/issues', authorize('student'), upload.proof.single('proof'), validate({
  body: z.object({ attendanceRecordId: id, reason: z.string().trim().min(5).max(500) }),
}), c.raiseIssue);

router.get('/issues/mine', authorize('student'), c.myIssues);
router.patch('/issues/:id/withdraw', authorize('student'), validate({ params: idParam }), c.withdrawIssue);

// ---------------- Lecturer / admin ----------------
router.post('/sessions', authorize('lecturer'), validate({
  body: z.object({
    teachingAssignmentId: id,
    sessionDate: dateStr,
    periodNo: z.coerce.number().int().min(1).max(12).default(1),
    startTime: timeStr.optional(),
    endTime: timeStr.optional(),
    topic: z.string().trim().max(200).optional(),
    records: z.array(record).default([]),   // only absentees need to be sent; the rest default to present
  }),
}), c.createSession);

router.get('/sessions', authorize('lecturer', 'admin'), validate({
  query: z.object({ teachingAssignmentId: id, from: dateStr.optional(), to: dateStr.optional() }),
}), c.listSessions);

router.get('/sessions/:id', authorize('lecturer', 'admin'), validate({ params: idParam }), c.getSession);

router.put('/sessions/:id/records', authorize('lecturer'), validate({
  params: idParam,
  body: z.object({ records: z.array(record).min(1), reason: z.string().trim().max(255).optional() }),
}), c.updateRecords);

router.get('/report', authorize('lecturer', 'admin'), validate({
  query: z.object({
    teachingAssignmentId: id, from: dateStr, to: dateStr,
    below: z.coerce.number().min(0).max(100).optional(),
  }),
}), c.report);

router.get('/issues', authorize('lecturer', 'admin'), validate({
  query: z.object({ status: z.enum(['open', 'approved', 'rejected', 'withdrawn']).optional() }),
}), c.listIssues);

router.patch('/issues/:id/resolve', authorize('lecturer', 'admin'), validate({
  params: idParam,
  body: z.object({ decision: z.enum(['approve', 'reject']), remarks: z.string().trim().max(500).optional() }),
}), c.resolveIssue);

module.exports = router;
