const router = require('express').Router();
const { z, id, idParam } = require('../../utils/zodHelpers');
const validate = require('../../middleware/validate');
const { authenticate, platformOnly } = require('../../middleware/auth');
const { ALL } = require('../../utils/permissions');
const c = require('./platform.controller');

// Everything here is for the platform admin only.
router.use(authenticate, platformOnly);

const permissions = z.array(z.enum(ALL)).max(ALL.length).default([]);

router.get('/permissions', c.permissions);
router.get('/admins', c.list);

router.post('/admins', validate({
  body: z.object({
    email: z.string().trim().toLowerCase().email(),
    fullName: z.string().trim().min(2).max(150),
    phone: z.string().trim().max(20).optional(),
    employeeCode: z.string().trim().min(2).max(30).optional(),
    designation: z.string().trim().max(100).optional(),
    permissions,
    isPlatformAdmin: z.boolean().default(false),
  }),
}), c.create);

router.put('/admins/:id/permissions', validate({
  params: idParam,
  body: z.object({ permissions, isPlatformAdmin: z.boolean().default(false) }),
}), c.updatePermissions);

router.patch('/admins/:id/status', validate({
  params: idParam,
  body: z.object({ status: z.enum(['active', 'inactive']) }),
}), c.setStatus);

router.post('/admins/:id/reset-password', validate({ params: z.object({ id }) }), c.resetPassword);

module.exports = router;
