const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../../config/env');
const { pool, withTransaction } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');
const { getProfileId } = require('../../utils/profile');
const { audit } = require('../../utils/audit');

exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const [rows] = await pool.query(
    'SELECT id, email, password_hash, role, full_name, status, must_change_password FROM users WHERE email = ?',
    [email]
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw new ApiError(401, 'Invalid email or password');
  }
  if (user.status !== 'active') throw new ApiError(403, 'Your account is not active. Contact the admin.');

  const profileId = await getProfileId(user.id, user.role);
  if (!profileId) throw new ApiError(403, 'Profile not found for this account. Contact the admin.');

  await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);

  const token = jwt.sign({ sub: user.id, role: user.role, pid: profileId }, env.jwt.secret, {
    expiresIn: env.jwt.expiresIn,
  });

  res.json({
    success: true,
    token,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.role,
      profileId,
      mustChangePassword: !!user.must_change_password,
    },
  });
});

exports.me = asyncHandler(async (req, res) => {
  const { id, role, profileId } = req.user;
  const [[user]] = await pool.query(
    'SELECT id, email, full_name, phone, role, must_change_password, last_login_at FROM users WHERE id = ?',
    [id]
  );
  let profile = null;
  if (role === 'student') {
    [[profile]] = await pool.query(
      `SELECT s.id, s.usn, s.status, p.code AS program_code, p.name AS program_name,
              sec.id AS section_id, sec.name AS section_name, sec.semester_no,
              sp.id AS specialization_id, sp.code AS specialization_code, sp.name AS specialization_name
         FROM students s JOIN programs p ON p.id = s.program_id JOIN sections sec ON sec.id = s.section_id
         LEFT JOIN specializations sp ON sp.id = sec.specialization_id
        WHERE s.id = ?`,
      [profileId]
    );
  } else if (role === 'lecturer') {
    [[profile]] = await pool.query(
      `SELECT l.id, l.employee_code, l.designation, l.qualification, d.id AS department_id, d.name AS department_name
         FROM lecturers l JOIN departments d ON d.id = l.department_id WHERE l.id = ?`,
      [profileId]
    );
  } else {
    [[profile]] = await pool.query('SELECT id, employee_code, designation FROM admins WHERE id = ?', [profileId]);
  }
  res.json({ success: true, data: { ...user, profile } });
});

exports.getStudentProfile = asyncHandler(async (req, res) => {
  const { id: userId, profileId } = req.user;
  const [rows] = await pool.query(
    `SELECT s.id AS student_id, s.usn, s.admission_year, s.date_of_birth, s.gender,
            s.address, s.guardian_name, s.guardian_phone, s.status,
            u.id AS user_id, u.full_name, u.email, u.phone,
            p.code AS program_code, p.name AS program_name,
            sec.name AS section_name, sec.semester_no,
            sp.code AS specialization_code, sp.name AS specialization_name
       FROM students s
       JOIN users u ON u.id = s.user_id
       JOIN programs p ON p.id = s.program_id
       JOIN sections sec ON sec.id = s.section_id
       LEFT JOIN specializations sp ON sp.id = sec.specialization_id
      WHERE s.id = ? AND u.id = ?`,
    [profileId, userId]
  );
  if (!rows[0]) throw new ApiError(404, 'Student profile not found');
  res.json({ success: true, data: rows[0] });
});

exports.updateStudentProfile = asyncHandler(async (req, res) => {
  const { id: userId, profileId } = req.user;
  const b = req.body;

  const [rows] = await pool.query(
    `SELECT s.date_of_birth, s.gender, s.address, s.guardian_name, s.guardian_phone, u.phone
       FROM students s JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND u.id = ?`,
    [profileId, userId]
  );
  if (!rows[0]) throw new ApiError(404, 'Student profile not found');
  const before = rows[0];

  const phone = b.phone !== undefined ? (b.phone ? String(b.phone).trim() : null) : before.phone;
  const dateOfBirth = b.dateOfBirth !== undefined ? (b.dateOfBirth ? String(b.dateOfBirth).trim() : null) : before.date_of_birth;
  const gender = b.gender !== undefined ? (b.gender ? String(b.gender).trim().toLowerCase() : null) : before.gender;
  const address = b.address !== undefined ? (b.address ? String(b.address).trim() : null) : before.address;
  const guardianName = b.guardianName !== undefined ? (b.guardianName ? String(b.guardianName).trim() : null) : before.guardian_name;
  const guardianPhone = b.guardianPhone !== undefined ? (b.guardianPhone ? String(b.guardianPhone).trim() : null) : before.guardian_phone;

  await withTransaction(async (conn) => {
    await conn.query('UPDATE users SET phone = ? WHERE id = ?', [phone, userId]);
    await conn.query(
      `UPDATE students
          SET date_of_birth = ?, gender = ?, address = ?, guardian_name = ?, guardian_phone = ?
        WHERE id = ? AND user_id = ?`,
      [dateOfBirth, gender, address, guardianName, guardianPhone, profileId, userId]
    );
  });

  const after = { phone, dateOfBirth, gender, address, guardianName, guardianPhone };
  await audit(req, 'STUDENT_PROFILE_SELF_UPDATED', 'student', profileId, before, after);

  res.json({ success: true, message: 'Profile updated successfully', data: after });
});

exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const [[user]] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  if (!(await bcrypt.compare(currentPassword, user.password_hash))) {
    throw new ApiError(400, 'Current password is incorrect');
  }
  const hash = await bcrypt.hash(newPassword, env.bcryptRounds);
  await pool.query('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', [hash, req.user.id]);
  res.json({ success: true, message: 'Password changed successfully' });
});

// Always answers the same message so nobody can find out which emails exist.
exports.forgotPassword = asyncHandler(async (req, res) => {
  const [rows] = await pool.query("SELECT id FROM users WHERE email = ? AND status = 'active'", [req.body.email]);
  if (rows[0]) {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await pool.query(
      'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 30 MINUTE))',
      [rows[0].id, tokenHash]
    );
    // TODO: send this link by email (for example with nodemailer). For development it is printed here.
    console.log(`Password reset link: ${env.clientUrl}/reset-password?token=${token}`);
  }
  res.json({ success: true, message: 'If this email is registered, a reset link has been sent.' });
});

exports.resetPassword = asyncHandler(async (req, res) => {
  const tokenHash = crypto.createHash('sha256').update(req.body.token).digest('hex');
  const hash = await bcrypt.hash(req.body.newPassword, env.bcryptRounds);

  await withTransaction(async (conn) => {
    const [rows] = await conn.query(
      'SELECT id, user_id FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW() FOR UPDATE',
      [tokenHash]
    );
    if (!rows[0]) throw new ApiError(400, 'Reset link is invalid or has expired');
    await conn.query('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', [hash, rows[0].user_id]);
    await conn.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?', [rows[0].id]);
  });
  res.json({ success: true, message: 'Password has been reset. You can log in now.' });
});
