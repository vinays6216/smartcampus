const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { z } = require('../../utils/zodHelpers');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const c = require('./auth.controller');

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, message: { success: false, message: 'Too many attempts, try again later' } });

const password = z.string().min(8, 'Password must be at least 8 characters').max(72);

router.post('/login', limiter, validate({
  body: z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) }),
}), c.login);

router.get('/me', authenticate, c.me);

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
