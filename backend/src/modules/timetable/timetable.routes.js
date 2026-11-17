const router = require('express').Router();
const { z, id, dateStr, timeStr, idParam } = require('../../utils/zodHelpers');
const validate = require('../../middleware/validate');
const upload = require('../../middleware/upload');
const { authenticate, authorize, adminCan } = require('../../middleware/auth');
const c = require('./timetable.controller');
const slots = require('./slots.controller');

router.use(authenticate);

// ---- weekly grid (timetable_slots) ----
const slotBody = z.object({
  teachingAssignmentId: id,
  dayOfWeek: z.coerce.number().int().min(1).max(7),
  periodNo: z.coerce.number().int().min(1).max(12),
  startTime: timeStr,
  endTime: timeStr,
  room: z.string().trim().max(50).optional(),
});
router.get('/slots', validate({ query: z.object({ sectionId: id.optional() }) }), slots.list);
router.post('/slots', authorize('admin'), adminCan('timetable'), validate({ body: slotBody }), slots.create);
router.put('/slots/:id', authorize('admin'), adminCan('timetable'), validate({ params: idParam, body: slotBody }), slots.update);
router.delete('/slots/:id', authorize('admin'), adminCan('timetable'), validate({ params: idParam }), slots.remove);

// ---- uploaded timetable files ----
router.get('/', validate({
  query: z.object({ sectionId: id.optional(), activeOnly: z.enum(['true', 'false']).optional() }),
}), c.list);

// multipart/form-data: file + sectionId + title + effectiveFrom (+ effectiveTo)
router.post('/', authorize('admin'), adminCan('timetable'), upload.timetable.single('file'), validate({
  body: z.object({
    sectionId: id, title: z.string().trim().min(2).max(150),
    effectiveFrom: dateStr, effectiveTo: dateStr.optional(),
  }),
}), c.upload);

router.patch('/:id/deactivate', authorize('admin'), adminCan('timetable'), validate({ params: idParam }), c.deactivate);

module.exports = router;
