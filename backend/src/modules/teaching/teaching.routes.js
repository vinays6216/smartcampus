const router = require('express').Router();
const { z, id, dateStr, idParam } = require('../../utils/zodHelpers');
const validate = require('../../middleware/validate');
const { authenticate, authorize } = require('../../middleware/auth');
const c = require('./teaching.controller');

router.use(authenticate);

router.get('/', authorize('admin', 'lecturer'), validate({
  query: z.object({ lecturerId: id.optional(), sectionId: id.optional(), subjectId: id.optional() }),
}), c.list);

router.post('/', authorize('admin'), validate({
  body: z.object({ lecturerId: id, subjectId: id, sectionId: id }),
}), c.create);

router.delete('/:id', authorize('admin'), validate({ params: idParam }), c.remove);

router.get('/:id/roster', authorize('admin', 'lecturer'), validate({
  params: idParam,
  query: z.object({ date: dateStr.optional(), period: z.coerce.number().int().min(1).max(12).optional() }),
}), c.roster);

module.exports = router;
