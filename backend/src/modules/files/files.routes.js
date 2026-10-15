const router = require('express').Router();
const { idParam } = require('../../utils/zodHelpers');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const c = require('./files.controller');

router.get('/:id', authenticate, validate({ params: idParam }), c.download);

module.exports = router;
