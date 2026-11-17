const router = require('express').Router();
const { z, dateStr, idParam } = require('../../utils/zodHelpers');
const validate = require('../../middleware/validate');
const upload = require('../../middleware/upload');
const { authenticate, authorize, adminCan } = require('../../middleware/auth');
const c = require('./leave.controller');

router.use(authenticate);

// ---------------- Student ----------------
// multipart/form-data: fromDate, toDate, leaveType, reason, optional file "proof"
router.post('/', authorize('student'), upload.proof.single('proof'), validate({
  body: z.object({
    fromDate: dateStr,
    toDate: dateStr,
    leaveType: z.enum(['medical', 'personal', 'event', 'other']).default('personal'),
    reason: z.string().trim().min(5).max(500),
  }),
}), c.create);
router.get('/mine', authorize('student'), c.mine);
router.patch('/:id/withdraw', authorize('student'), validate({ params: idParam }), c.withdraw);

// ---------------- Lecturer / admin ----------------
const staff = [authorize('lecturer', 'admin'), adminCan('attendance')];
router.get('/', staff, validate({
  query: z.object({ status: z.enum(['open', 'approved', 'rejected', 'withdrawn']).optional() }),
}), c.list);
router.patch('/:id/decide', staff, validate({
  params: idParam,
  body: z.object({ decision: z.enum(['approve', 'reject']), remarks: z.string().trim().max(500).optional() }),
}), c.decide);

module.exports = router;
