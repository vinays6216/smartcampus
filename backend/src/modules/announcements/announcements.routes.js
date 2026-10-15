const router = require('express').Router();
const { z, id, dateStr, timeStr, boolOpt, idParam } = require('../../utils/zodHelpers');
const validate = require('../../middleware/validate');
const { authenticate, authorize } = require('../../middleware/auth');
const c = require('./announcements.controller');

router.use(authenticate);

router.get('/', validate({ query: z.object({ page: z.string().optional(), limit: z.string().optional() }) }), c.list);

const eventSchema = z.object({
  title: z.string().trim().max(200).optional(),
  eventType: z.enum(['extra_class', 'special_class', 'exam', 'holiday', 'event', 'other']),
  eventDate: dateStr,
  startTime: timeStr.optional(),
  endTime: timeStr.optional(),
  location: z.string().trim().max(150).optional(),
  subjectId: id.optional(),
});

router.post('/', authorize('lecturer', 'admin'), validate({
  body: z.object({
    title: z.string().trim().min(3).max(200),
    body: z.string().trim().min(3).max(5000),
    audienceType: z.enum(['all', 'students', 'lecturers', 'department', 'section']).default('section'),
    departmentId: id.optional(),
    sectionId: id.optional(),
    priority: z.enum(['normal', 'important', 'urgent']).default('normal'),
    publishAt: z.string().optional(),
    expiresAt: z.string().optional(),
    event: eventSchema.optional(),      // add this to put it on the calendar too
  }),
}), c.create);

router.put('/:id', authorize('lecturer', 'admin'), validate({
  params: idParam,
  body: z.object({
    title: z.string().trim().min(3).max(200).optional(), body: z.string().trim().min(3).max(5000).optional(),
    priority: z.enum(['normal', 'important', 'urgent']).optional(), expiresAt: z.string().optional(), isPublished: boolOpt,
  }),
}), c.update);

router.delete('/:id', authorize('lecturer', 'admin'), validate({ params: idParam }), c.remove);

module.exports = router;
