const router = require('express').Router();
const { z, id, dateStr, timeStr, idParam } = require('../../utils/zodHelpers');
const validate = require('../../middleware/validate');
const { authenticate, authorize, adminCan } = require('../../middleware/auth');
const c = require('./calendar.controller');

router.use(authenticate);

const eventType = z.enum(['extra_class', 'special_class', 'exam', 'holiday', 'event', 'other']);
// matches the table's CHECK (end_time > start_time) so the user gets a clear message instead of a DB error
const timesInOrder = (b) => !b.startTime || !b.endTime || b.endTime.slice(0, 5) > b.startTime.slice(0, 5);
const timeMessage = { message: 'End time must be after start time', path: ['endTime'] };

router.get('/', validate({ query: z.object({ from: dateStr.optional(), to: dateStr.optional() }) }), c.list);

router.post('/', authorize('lecturer', 'admin'), adminCan('announcements'), validate({
  body: z.object({
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().max(500).optional(),
    eventType,
    eventDate: dateStr,
    startTime: timeStr.optional(),
    endTime: timeStr.optional(),
    location: z.string().trim().max(150).optional(),
    sectionId: id.optional(),
    subjectId: id.optional(),
  }).refine(timesInOrder, timeMessage),
}), c.create);

// Edit an event (creator or admin). Empty strings clear optional fields. The section cannot be changed.
const optionalText = (max) => z.string().trim().max(max).optional();
const optionalTime = z.union([timeStr, z.literal('')]).optional();
router.put('/:id', authorize('lecturer', 'admin'), adminCan('announcements'), validate({
  params: idParam,
  body: z.object({
    title: z.string().trim().min(3).max(200).optional(),
    description: optionalText(500),
    eventType: eventType.optional(),
    eventDate: dateStr.optional(),
    startTime: optionalTime,
    endTime: optionalTime,
    location: optionalText(150),
  }),
}), c.update);

router.delete('/:id', authorize('lecturer', 'admin'), adminCan('announcements'), validate({ params: idParam }), c.remove);

module.exports = router;
