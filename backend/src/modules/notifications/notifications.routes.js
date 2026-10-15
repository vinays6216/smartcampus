const router = require('express').Router();
const { z, idParam } = require('../../utils/zodHelpers');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const c = require('./notifications.controller');

router.use(authenticate);

router.get('/', validate({
  query: z.object({ unread: z.enum(['true', 'false']).optional(), page: z.string().optional(), limit: z.string().optional() }),
}), c.list);
router.get('/unread-count', c.unreadCount);
router.patch('/read-all', c.markAllRead);               // keep above "/:id/read"
router.patch('/:id/read', validate({ params: idParam }), c.markRead);

module.exports = router;
