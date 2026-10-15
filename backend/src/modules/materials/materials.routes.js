const router = require('express').Router();
const { z, id, boolOpt, idParam } = require('../../utils/zodHelpers');
const validate = require('../../middleware/validate');
const upload = require('../../middleware/upload');
const { authenticate, authorize } = require('../../middleware/auth');
const c = require('./materials.controller');

router.use(authenticate);

router.get('/', validate({
  query: z.object({
    teachingAssignmentId: id.optional(), subjectId: id.optional(),
    type: z.enum(['pdf', 'ppt', 'doc', 'other']).optional(), q: z.string().trim().optional(),
  }),
}), c.list);

// Download / view the file itself with GET /api/files/:fileId  (add ?inline=1 to open in the browser)

// multipart/form-data: file (pdf, ppt, pptx, doc, docx), teachingAssignmentId, title, description?, unitNo?
router.post('/', authorize('lecturer'), upload.material.single('file'), validate({
  body: z.object({
    teachingAssignmentId: id, title: z.string().trim().min(2).max(200),
    description: z.string().trim().max(500).optional(), unitNo: z.coerce.number().int().min(1).max(50).optional(),
  }),
}), c.upload);

router.put('/:id', authorize('lecturer', 'admin'), validate({
  params: idParam,
  body: z.object({
    title: z.string().trim().min(2).max(200).optional(), description: z.string().trim().max(500).optional(),
    unitNo: z.coerce.number().int().min(1).max(50).optional(), isActive: boolOpt,
  }),
}), c.update);

router.delete('/:id', authorize('lecturer', 'admin'), validate({ params: idParam }), c.hide);

module.exports = router;
