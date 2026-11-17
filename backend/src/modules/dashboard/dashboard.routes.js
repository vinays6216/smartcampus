const router = require('express').Router();
const { authenticate } = require('../../middleware/auth');
const c = require('./dashboard.controller');

router.get('/', authenticate, c.summary);
router.get('/upcoming', authenticate, c.upcoming);

module.exports = router;
