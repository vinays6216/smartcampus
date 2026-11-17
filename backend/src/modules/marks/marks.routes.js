const router = require('express').Router();
const { z, id, dateStr, idParam } = require('../../utils/zodHelpers');
const validate = require('../../middleware/validate');
const { authenticate, authorize, adminCan } = require('../../middleware/auth');
const c = require('./marks.controller');

router.use(authenticate);

// ---------------- Student ----------------
router.get('/mine', authorize('student'), c.mine);

// ---------------- Lecturer / admin ("assignments" permission: assignments, materials & marks) ----------------
const staff = [authorize('lecturer', 'admin'), adminCan('assignments')];
const kind = z.enum(['test', 'quiz', 'assignment', 'lab', 'other']);
const maxMarks = z.coerce.number().positive().max(1000);

router.get('/assessments', staff, validate({ query: z.object({ teachingAssignmentId: id }) }), c.list);
router.post('/assessments', staff, validate({
  body: z.object({
    teachingAssignmentId: id, title: z.string().trim().min(1).max(100), kind: kind.default('test'),
    maxMarks, heldOn: dateStr.optional(),
  }),
}), c.create);
router.get('/assessments/:id', staff, validate({ params: idParam }), c.get);
router.put('/assessments/:id', staff, validate({
  params: idParam,
  body: z.object({ title: z.string().trim().min(1).max(100).optional(), kind: kind.optional(), maxMarks: maxMarks.optional(), heldOn: dateStr.or(z.literal('')).optional() }),
}), c.update);
router.delete('/assessments/:id', staff, validate({ params: idParam }), c.remove);
router.put('/assessments/:id/marks', staff, validate({
  params: idParam,
  body: z.object({
    marks: z.array(z.object({
      studentId: id,
      marks: z.number().min(0).max(1000).nullable().optional(),
      absent: z.boolean().optional(),
      remarks: z.string().trim().max(255).optional(),
    })).min(1).max(500),
  }),
}), c.saveMarks);
router.patch('/assessments/:id/publish', staff, validate({ params: idParam, body: z.object({ published: z.boolean() }) }), c.publish);
router.get('/class/:teachingAssignmentId', staff, validate({ params: z.object({ teachingAssignmentId: id }) }), c.classSummary);

module.exports = router;
