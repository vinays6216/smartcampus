const router = require('express').Router();
const { authenticate, authorize, adminCan } = require('../../middleware/auth');
const cruds = require('./academic.controller');

router.use(authenticate);

// Generates, for each resource:
//   GET    /api/academic/<resource>        any logged-in user (dropdowns)
//   GET    /api/academic/<resource>/:id    any logged-in user
//   POST   /api/academic/<resource>        admin
//   PUT    /api/academic/<resource>/:id    admin
//   DELETE /api/academic/<resource>/:id    admin
// resources: departments, programs, academic-years, sections, subjects
for (const [name, crud] of Object.entries(cruds)) {
  router.get(`/${name}`, crud.list);
  router.get(`/${name}/:id`, crud.get);
  router.post(`/${name}`, authorize('admin'), adminCan('academic'), crud.create);
  router.put(`/${name}/:id`, authorize('admin'), adminCan('academic'), crud.update);
  router.delete(`/${name}/:id`, authorize('admin'), adminCan('academic'), crud.remove);
}

module.exports = router;
