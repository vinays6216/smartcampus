const router = require('express').Router();
const { z, id, dateStr, idParam } = require('../../utils/zodHelpers');
const validate = require('../../middleware/validate');
const { authenticate, authorize } = require('../../middleware/auth');
const c = require('./users.controller');

router.use(authenticate, authorize('admin'));

const email = z.string().trim().toLowerCase().email();
const optText = (max) => z.string().trim().max(max).optional();
const password = z.string().min(8).max(72).optional();

const studentBody = z.object({
  email, password,
  fullName: z.string().trim().min(2).max(150),
  phone: optText(20),
  usn: z.string().trim().min(3).max(20).toUpperCase(),
  programId: id,
  sectionId: id,
  admissionYear: z.coerce.number().int().min(2000).max(2100).optional(),
  dateOfBirth: dateStr.optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  address: optText(255),
  guardianName: optText(150),
  guardianPhone: optText(20),
});

const lecturerBody = z.object({
  email, password,
  fullName: z.string().trim().min(2).max(150),
  phone: optText(20),
  employeeCode: z.string().trim().min(2).max(30),
  departmentId: id,
  designation: optText(100),
  qualification: optText(150),
  joinedOn: dateStr.optional(),
});

const listQuery = z.object({
  q: z.string().trim().optional(), programId: id.optional(), sectionId: id.optional(),
  departmentId: id.optional(), status: z.string().optional(), page: z.string().optional(), limit: z.string().optional(),
});

// ---- Students ----
router.get('/students', validate({ query: listQuery }), c.listStudents);
router.get('/students/:id', validate({ params: idParam }), c.getStudent);
router.post('/students', validate({ body: studentBody }), c.createStudent);
router.put('/students/:id', validate({ params: idParam, body: studentBody.partial().omit({ password: true }) }), c.updateStudent);
router.patch('/students/:id/status', validate({
  params: idParam, body: z.object({ status: z.enum(['active', 'suspended', 'dropped', 'passed_out']) }),
}), c.updateStudentStatus);

// ---- Lecturers ----
router.get('/lecturers', validate({ query: listQuery }), c.listLecturers);
router.get('/lecturers/:id', validate({ params: idParam }), c.getLecturer);
router.post('/lecturers', validate({ body: lecturerBody }), c.createLecturer);
router.put('/lecturers/:id', validate({ params: idParam, body: lecturerBody.partial().omit({ password: true }) }), c.updateLecturer);
router.patch('/lecturers/:id/status', validate({
  params: idParam, body: z.object({ status: z.enum(['active', 'inactive', 'suspended']) }),
}), c.updateLecturerStatus);

// ---- Misc ----
router.post('/users/:userId/reset-password', validate({ params: z.object({ userId: id }) }), c.resetUserPassword);
router.get('/dashboard/counts', c.counts);

module.exports = router;
