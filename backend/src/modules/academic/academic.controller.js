const { z, id: idSchema, dateStr, bool } = require('../../utils/zodHelpers');
const { pool, withTransaction } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');

const str = (min, max) => z.string().trim().min(min).max(max);

// One config object per table. makeCrud() turns it into list/get/create/update/remove handlers.
const resources = {
  departments: {
    table: 'departments',
    select: 'SELECT d.* FROM departments d',
    alias: 'd',
    order: 'd.name',
    filters: {},
    map: { code: 'code', name: 'name' },
    schema: z.object({ code: str(1, 20).toUpperCase(), name: str(2, 150) }),
  },
  programs: {
    table: 'programs',
    select: 'SELECT p.*, d.name AS department_name FROM programs p JOIN departments d ON d.id = p.department_id',
    alias: 'p',
    order: 'p.name',
    filters: { departmentId: 'p.department_id' },
    map: { departmentId: 'department_id', code: 'code', name: 'name', durationSemesters: 'duration_semesters' },
    schema: z.object({
      departmentId: idSchema, code: str(1, 20).toUpperCase(), name: str(2, 150),
      durationSemesters: z.coerce.number().int().min(1).max(12).default(4),
    }),
  },
  'academic-years': {
    table: 'academic_years',
    select: 'SELECT ay.* FROM academic_years ay',
    alias: 'ay',
    order: 'ay.start_date DESC',
    filters: {},
    map: { label: 'label', startDate: 'start_date', endDate: 'end_date', isCurrent: 'is_current' },
    schema: z.object({ label: str(4, 20), startDate: dateStr, endDate: dateStr, isCurrent: bool(false) }),
    // only one academic year can be "current"
    beforeSave: async (conn, data, id) => {
      if (data.isCurrent) await conn.query('UPDATE academic_years SET is_current = 0 WHERE id <> ?', [id || 0]);
    },
  },
  sections: {
    table: 'sections',
    select: `SELECT sec.*, p.code AS program_code, ay.label AS academic_year
               FROM sections sec JOIN programs p ON p.id = sec.program_id
               JOIN academic_years ay ON ay.id = sec.academic_year_id`,
    alias: 'sec',
    order: 'ay.start_date DESC, p.code, sec.semester_no, sec.name',
    filters: { programId: 'sec.program_id', academicYearId: 'sec.academic_year_id', semesterNo: 'sec.semester_no' },
    map: { programId: 'program_id', academicYearId: 'academic_year_id', semesterNo: 'semester_no', name: 'name' },
    schema: z.object({
      programId: idSchema, academicYearId: idSchema,
      semesterNo: z.coerce.number().int().min(1).max(12), name: str(1, 10).toUpperCase(),
    }),
  },
  subjects: {
    table: 'subjects',
    select: 'SELECT sub.*, p.code AS program_code FROM subjects sub JOIN programs p ON p.id = sub.program_id',
    alias: 'sub',
    order: 'p.code, sub.semester_no, sub.code',
    filters: { programId: 'sub.program_id', semesterNo: 'sub.semester_no' },
    map: { programId: 'program_id', code: 'code', name: 'name', semesterNo: 'semester_no', credits: 'credits', subjectType: 'subject_type' },
    schema: z.object({
      programId: idSchema, code: str(1, 20).toUpperCase(), name: str(2, 150),
      semesterNo: z.coerce.number().int().min(1).max(12),
      credits: z.coerce.number().int().min(0).max(10).default(3),
      subjectType: z.enum(['theory', 'lab', 'elective', 'project']).default('theory'),
    }),
  },
};

function makeCrud(cfg) {
  const { table, select, alias, order, filters, map, schema, beforeSave } = cfg;
  const updateSchema = schema.partial();
  const columnsOf = (data) => Object.keys(map).filter((k) => data[k] !== undefined);

  return {
    list: asyncHandler(async (req, res) => {
      const where = ['1=1'];
      const params = [];
      for (const [queryKey, column] of Object.entries(filters)) {
        const v = req.query[queryKey];
        if (v !== undefined && v !== '') { where.push(`${column} = ?`); params.push(v); }
      }
      const [rows] = await pool.query(`${select} WHERE ${where.join(' AND ')} ORDER BY ${order}`, params);
      res.json({ success: true, data: rows });
    }),

    get: asyncHandler(async (req, res) => {
      const id = idSchema.parse(req.params.id);
      const [rows] = await pool.query(`${select} WHERE ${alias}.id = ?`, [id]);
      if (!rows[0]) throw new ApiError(404, 'Record not found');
      res.json({ success: true, data: rows[0] });
    }),

    create: asyncHandler(async (req, res) => {
      const data = schema.parse(req.body);
      const keys = columnsOf(data);
      const id = await withTransaction(async (conn) => {
        if (beforeSave) await beforeSave(conn, data, null);
        const [r] = await conn.query(
          `INSERT INTO ${table} (${keys.map((k) => map[k]).join(', ')}) VALUES (?)`,
          [keys.map((k) => data[k])]
        );
        return r.insertId;
      });
      res.status(201).json({ success: true, data: { id } });
    }),

    update: asyncHandler(async (req, res) => {
      const id = idSchema.parse(req.params.id);
      const data = updateSchema.parse(req.body);
      const keys = columnsOf(data);
      if (!keys.length) throw new ApiError(400, 'Nothing to update');
      await withTransaction(async (conn) => {
        if (beforeSave) await beforeSave(conn, data, id);
        const [r] = await conn.query(
          `UPDATE ${table} SET ${keys.map((k) => `${map[k]} = ?`).join(', ')} WHERE id = ?`,
          [...keys.map((k) => data[k]), id]
        );
        if (!r.affectedRows) throw new ApiError(404, 'Record not found');
      });
      res.json({ success: true, message: 'Updated' });
    }),

    remove: asyncHandler(async (req, res) => {
      const id = idSchema.parse(req.params.id);
      const [r] = await pool.query(`DELETE FROM ${table} WHERE id = ?`, [id]); // FK RESTRICT -> 409 when in use
      if (!r.affectedRows) throw new ApiError(404, 'Record not found');
      res.json({ success: true, message: 'Deleted' });
    }),
  };
}

module.exports = Object.fromEntries(Object.entries(resources).map(([name, cfg]) => [name, makeCrud(cfg)]));
