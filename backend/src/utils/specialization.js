const ApiError = require('./ApiError');

// Rules for programs that have specializations (MCA: specialization starts in semester 3).
//   programs.specialization_start_sem = 3
//   Sections of semester >= 3 MUST have a specialization; sections below it must NOT.
//   Subjects of semester >= 3 MAY have a specialization (NULL = common subject for everybody).

async function getProgram(conn, programId) {
  const [[program]] = await conn.query('SELECT id, specialization_start_sem FROM programs WHERE id = ?', [programId]);
  if (!program) throw new ApiError(400, 'Program does not exist');
  return program;
}

async function assertSpecializationOfProgram(conn, specializationId, programId) {
  const [rows] = await conn.query('SELECT id FROM specializations WHERE id = ? AND program_id = ?', [specializationId, programId]);
  if (!rows.length) throw new ApiError(400, 'Specialization does not belong to the selected program');
}

exports.checkSectionSpecialization = async (conn, programId, semesterNo, specializationId) => {
  const start = (await getProgram(conn, programId)).specialization_start_sem;
  const needsSpecialization = start !== null && semesterNo >= start;
  if (needsSpecialization && !specializationId) {
    throw new ApiError(400, `Semester ${semesterNo} sections need a specialization (specializations start in semester ${start})`);
  }
  if (!needsSpecialization && specializationId) {
    throw new ApiError(400, start === null
      ? 'This program has no specializations'
      : `Specializations start only from semester ${start}`);
  }
  if (specializationId) await assertSpecializationOfProgram(conn, specializationId, programId);
};

exports.checkSubjectSpecialization = async (conn, programId, semesterNo, specializationId) => {
  if (!specializationId) return; // common subject
  const start = (await getProgram(conn, programId)).specialization_start_sem;
  if (start === null || semesterNo < start) {
    throw new ApiError(400, start === null
      ? 'This program has no specializations'
      : `Specialization subjects are allowed only from semester ${start}`);
  }
  await assertSpecializationOfProgram(conn, specializationId, programId);
};
