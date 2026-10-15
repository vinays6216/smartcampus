const router = require('express').Router();
const { z, id, bool, boolOpt, idParam } = require('../../utils/zodHelpers');
const validate = require('../../middleware/validate');
const upload = require('../../middleware/upload');
const { authenticate, authorize } = require('../../middleware/auth');
const c = require('./assignments.controller');

router.use(authenticate);

const assignmentFields = {
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(5000).optional(),
  maxMarks: z.coerce.number().positive().max(1000).optional(),
  deadline: z.string().min(10, 'Deadline is required'),
};

// =================== Lecturer / Admin ===================
// Admin can list, view, close, delete (draft) and see submissions of every assignment.
const staff = authorize('lecturer', 'admin');

router.get('/manage', staff, validate({
  query: z.object({ teachingAssignmentId: id.optional(), status: z.enum(['draft', 'published', 'closed']).optional() }),
}), c.listManaged);

// multipart/form-data: fields below + optional files[] (attachments)
router.post('/manage', authorize('lecturer'), upload.assignment.array('files', 5), validate({
  body: z.object({
    teachingAssignmentId: id, ...assignmentFields,
    allowOnline: bool(true), allowManual: bool(true), allowLate: bool(false),
  }),
}), c.create);

router.get('/manage/:id', staff, validate({ params: idParam }), c.getManaged);

router.put('/manage/:id', staff, validate({
  params: idParam,
  body: z.object({
    title: assignmentFields.title.optional(), description: assignmentFields.description,
    maxMarks: assignmentFields.maxMarks, deadline: assignmentFields.deadline.optional(),
    allowOnline: boolOpt, allowManual: boolOpt, allowLate: boolOpt,
  }),
}), c.update);

router.post('/manage/:id/publish', authorize('lecturer'), validate({ params: idParam }), c.publish);
router.post('/manage/:id/close', staff, validate({ params: idParam }), c.close);
router.delete('/manage/:id', staff, validate({ params: idParam }), c.remove);

router.get('/manage/:id/submissions', staff, validate({
  params: idParam, query: z.object({ status: z.enum(['submitted', 'not_submitted']).optional() }),
}), c.submissions);

router.patch('/manage/submissions/:submissionId/grade', staff, validate({
  params: z.object({ submissionId: id }),
  body: z.object({ marks: z.coerce.number().min(0), feedback: z.string().trim().max(500).optional() }),
}), c.grade);

// =================== Student ===================
const student = authorize('student');

router.get('/student', student, validate({
  query: z.object({ displayStatus: z.enum(['Pending', 'Due soon', 'Overdue', 'Submitted']).optional() }),
}), c.studentList);

router.get('/student/alerts', student, c.studentAlerts);   // keep above "/student/:id"
router.get('/student/:id', student, validate({ params: idParam }), c.studentDetail);
router.post('/student/:id/submit-manual', student, validate({ params: idParam }), c.submitManual);
router.post('/student/:id/submit-url', student, validate({
  params: idParam, body: z.object({ url: z.string().trim().url().max(500) }),
}), c.submitUrl);
router.post('/student/:id/submit-file', student, upload.submission.single('file'), validate({ params: idParam }), c.submitFile);
router.post('/student/:id/unsubmit', student, validate({ params: idParam }), c.unsubmit);

module.exports = router;
