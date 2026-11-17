const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { z, dateStr } = require('../../utils/zodHelpers');
const validate = require('../../middleware/validate');
const { authenticate, authorize } = require('../../middleware/auth');
const c = require('./auth.controller');

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: { success: false, message: 'Too many attempts, try again later' } });

const password = z.string().min(8, 'Password must be at least 8 characters').max(72);

router.post('/login', limiter, validate({
  body: z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) }),
}), c.login);

router.get('/me', authenticate, c.me);

// Student profile: view & self-edit
router.get('/student-profile', authenticate, authorize('student'), c.getStudentProfile);
router.put('/student-profile', authenticate, authorize('student'), validate({
  body: z.object({
    phone: z.string().trim().max(20).optional().nullable(),
    dateOfBirth: z.preprocess((v) => (!v ? null : v), dateStr.nullable().optional()),
    gender: z.preprocess((v) => (!v ? null : v), z.enum(['male', 'female', 'other']).nullable().optional()),
    address: z.string().trim().max(255).optional().nullable(),
    guardianName: z.string().trim().max(150).optional().nullable(),
    guardianPhone: z.string().trim().max(20).optional().nullable(),
  }),
}), c.updateStudentProfile);

router.post('/change-password', authenticate, validate({
  body: z.object({ currentPassword: z.string().min(1), newPassword: password }),
}), c.changePassword);

router.post('/forgot-password', limiter, validate({
  body: z.object({ email: z.string().trim().toLowerCase().email() }),
}), c.forgotPassword);

router.post('/reset-password', limiter, validate({
  body: z.object({ token: z.string().min(10), newPassword: password }),
}), c.resetPassword);

module.exports = router;
