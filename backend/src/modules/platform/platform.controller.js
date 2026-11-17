const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const env = require('../../config/env');
const { pool, withTransaction } = require('../../config/db');
const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');
const { audit } = require('../../utils/audit');
const { AREAS, ALL } = require('../../utils/permissions');

// Platform admin: manage admin accounts and what each admin may do.

const tempPassword = () => crypto.randomBytes(9).toString('base64url');

exports.permissions = asyncHandler(async (req, res) => {
  res.json({ success: true, data: ALL.map((key) => ({ key, label: AREAS[key] })) });
});

exports.list = asyncHandler(async (req, res) => {
  const [rows] = await pool.query(
    `SELECT a.id, a.user_id, a.employee_code, a.designation, u.email, u.full_name, u.phone, u.status, u.last_login_at,
            GROUP_CONCAT(ap.permission ORDER BY ap.permission) AS perms
       FROM admins a
       JOIN users u ON u.id = a.user_id
       LEFT JOIN admin_permissions ap ON ap.admin_id = a.id
      GROUP BY a.id, a.user_id, a.employee_code, a.designation, u.email, u.full_name, u.phone, u.status, u.last_login_at
      ORDER BY u.full_name`
  );
  res.json({
    success: true,
    data: rows.map(({ perms, ...r }) => {
      const list = perms ? perms.split(',') : [];
      const platform = list.includes('platform');
      return { ...r, is_platform_admin: platform, permissions: platform ? ALL : list.filter((p) => p !== 'platform'), is_me: r.id === req.user.profileId };
    }),
  });
});

async function activePlatformAdmins(conn, exceptAdminId) {
  const [[r]] = await conn.query(
    `SELECT COUNT(*) AS n FROM admin_permissions ap JOIN admins a ON a.id = ap.admin_id JOIN users u ON u.id = a.user_id
      WHERE ap.permission = 'platform' AND u.status = 'active' AND a.id <> ?`,
    [exceptAdminId]
  );
  return r.n;
}

async function setPermissions(conn, adminId, permissions, platform, grantedBy) {
  await conn.query('DELETE FROM admin_permissions WHERE admin_id = ?', [adminId]);
  const keys = [...new Set(platform ? ['platform'] : permissions)];
  if (keys.length) {
    await conn.query('INSERT INTO admin_permissions (admin_id, permission, granted_by) VALUES ?', [keys.map((k) => [adminId, k, grantedBy])]);
  }
}

async function getAdmin(conn, id) {
  const [[a]] = await conn.query('SELECT a.id, a.user_id, u.email, u.status FROM admins a JOIN users u ON u.id = a.user_id WHERE a.id = ?', [id]);
  if (!a) throw new ApiError(404, 'Admin not found');
  return a;
}

exports.create = asyncHandler(async (req, res) => {
  const b = req.body;
  const password = tempPassword();
  const hash = await bcrypt.hash(password, env.bcryptRounds);
  const id = await withTransaction(async (conn) => {
    const [u] = await conn.query(
      "INSERT INTO users (email, password_hash, role, full_name, phone, must_change_password) VALUES (?, ?, 'admin', ?, ?, 1)",
      [b.email, hash, b.fullName, b.phone || null]
    );
    const [a] = await conn.query(
      'INSERT INTO admins (user_id, employee_code, designation) VALUES (?, ?, ?)',
      [u.insertId, b.employeeCode || `ADM${u.insertId}`, b.designation || null]
    );
    await setPermissions(conn, a.insertId, b.permissions, b.isPlatformAdmin, req.user.id);
    return a.insertId;
  });
  await audit(req, 'ADMIN_CREATED', 'admin', id, null, { email: b.email, permissions: b.permissions, isPlatformAdmin: b.isPlatformAdmin });
  res.status(201).json({ success: true, data: { id, temporaryPassword: password } });
});

exports.updatePermissions = asyncHandler(async (req, res) => {
  const adminId = Number(req.params.id);
  const { permissions, isPlatformAdmin } = req.body;
  await withTransaction(async (conn) => {
    await getAdmin(conn, adminId);
    if (!isPlatformAdmin) {
      if (adminId === req.user.profileId) throw new ApiError(400, 'You cannot remove your own platform admin rights');
      if (!(await activePlatformAdmins(conn, adminId))) throw new ApiError(400, 'There must be at least one active platform admin');
    }
    await setPermissions(conn, adminId, permissions, isPlatformAdmin, req.user.id);
  });
  await audit(req, 'ADMIN_PERMISSIONS_CHANGED', 'admin', adminId, null, { permissions, isPlatformAdmin });
  res.json({ success: true, message: 'Permissions saved' });
});

exports.setStatus = asyncHandler(async (req, res) => {
  const adminId = Number(req.params.id);
  const { status } = req.body;
  await withTransaction(async (conn) => {
    const a = await getAdmin(conn, adminId);
    if (status !== 'active') {
      if (adminId === req.user.profileId) throw new ApiError(400, 'You cannot deactivate your own account');
      if (!(await activePlatformAdmins(conn, adminId))) throw new ApiError(400, 'There must be at least one active platform admin');
    }
    await conn.query('UPDATE users SET status = ? WHERE id = ?', [status, a.user_id]);
  });
  await audit(req, 'ADMIN_STATUS_CHANGED', 'admin', adminId, null, { status });
  res.json({ success: true, message: status === 'active' ? 'Admin activated' : 'Admin deactivated' });
});

exports.resetPassword = asyncHandler(async (req, res) => {
  const adminId = Number(req.params.id);
  const a = await getAdmin(pool, adminId);
  const password = tempPassword();
  await pool.query('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?', [await bcrypt.hash(password, env.bcryptRounds), a.user_id]);
  await audit(req, 'ADMIN_PASSWORD_RESET', 'admin', adminId);
  res.json({ success: true, data: { temporaryPassword: password } });
});
