const router = require('express').Router();
const { z, id, dateStr, idParam } = require('../../utils/zodHelpers');
const validate = require('../../middleware/validate');
const upload = require('../../middleware/upload');
const { authenticate, authorize } = require('../../middleware/auth');
const c = require('./timetable.controller');

router.use(authenticate);

router.get('/', validate({
  query: z.object({ sectionId: id.optional(), activeOnly: z.enum(['true', 'false']).optional() }),
}), c.list);

// multipart/form-data: file + sectionId + title + effectiveFrom (+ effectiveTo)
router.post('/', authorize('admin'), upload.timetable.single('file'), validate({
  body: z.object({
    sectionId: id, title: z.string().trim().min(2).max(150),
    effectiveFrom: dateStr, effectiveTo: dateStr.optional(),
  }),
}), c.upload);

router.patch('/:id/deactivate', authorize('admin'), validate({ params: idParam }), c.deactivate);

module.exports = router;
