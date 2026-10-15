const router = require('express').Router();
const { z, id, dateStr, timeStr, idParam } = require('../../utils/zodHelpers');
const validate = require('../../middleware/validate');
const { authenticate, authorize } = require('../../middleware/auth');
const c = require('./calendar.controller');

router.use(authenticate);

router.get('/', validate({ query: z.object({ from: dateStr.optional(), to: dateStr.optional() }) }), c.list);

router.post('/', authorize('lecturer', 'admin'), validate({
  body: z.object({
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().max(500).optional(),
    eventType: z.enum(['extra_class', 'special_class', 'exam', 'holiday', 'event', 'other']),
    eventDate: dateStr,
    startTime: timeStr.optional(),
    endTime: timeStr.optional(),
    location: z.string().trim().max(150).optional(),
    sectionId: id.optional(),
    subjectId: id.optional(),
  }),
}), c.create);

router.delete('/:id', authorize('lecturer', 'admin'), validate({ params: idParam }), c.remove);

module.exports = router;
