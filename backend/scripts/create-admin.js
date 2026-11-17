// Sets up an admin account.
//
// The schema's starter data creates admin@smartcampus.local with a placeholder hash that matches no password.
// Give it a real password:
//   node scripts/create-admin.js --email admin@smartcampus.local
// Or create another admin (users row + admins profile row):
//   node scripts/create-admin.js --email admin@college.edu --name "Admin Name" [--code ADM002] [--designation "Administrator"]
// Add --platform to make the account a platform admin (needs database/migrations/002_admin_permissions.sql).
// This is also the way back in if no platform admin can sign in any more.
//
// The password is read from the ADMIN_PASSWORD environment variable. If it is not set, a random
// temporary password is generated and printed once; the admin must change it at first sign-in.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const env = require('../src/config/env');
const { pool, withTransaction } = require('../src/config/db');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const platform = process.argv.includes('--platform');
async function grantPlatform(conn, adminId) {
  if (!platform) return;
  try {
    await conn.query("INSERT IGNORE INTO admin_permissions (admin_id, permission) VALUES (?, 'platform')", [adminId]);
    console.log('Platform admin rights granted.');
  } catch (e) {
    if (e.code === 'ER_NO_SUCH_TABLE') throw new Error('run database/migrations/002_admin_permissions.sql first (needed for --platform).');
    throw e;
  }
}

(async () => {
  const email = arg('email');
  if (!email) {
    console.error('Usage: node scripts/create-admin.js --email <email> [--name "<full name>"] [--code <employee code>] [--designation <text>]');
    process.exit(1);
  }

  const generated = !process.env.ADMIN_PASSWORD;
  const password = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  if (password.length < 8) {
    console.error('ADMIN_PASSWORD must be at least 8 characters.');
    process.exit(1);
  }

  try {
    const hash = await bcrypt.hash(password, env.bcryptRounds);
    const action = await withTransaction(async (conn) => {
      const [[existing]] = await conn.query('SELECT id, role FROM users WHERE email = ?', [email]);

      // Existing admin (e.g. the starter admin): set its password.
      if (existing) {
        if (existing.role !== 'admin') throw new Error(`${email} belongs to a ${existing.role}, not an admin.`);
        const [[profile]] = await conn.query('SELECT id FROM admins WHERE user_id = ?', [existing.id]);
        if (!profile) throw new Error(`${email} has no admins profile row.`);
        await conn.query(
          "UPDATE users SET password_hash = ?, must_change_password = ?, status = 'active' WHERE id = ?",
          [hash, generated ? 1 : 0, existing.id]
        );
        await grantPlatform(conn, profile.id);
        return 'Password set for existing admin';
      }

      // New admin.
      const fullName = arg('name');
      if (!fullName) throw new Error('--name "<full name>" is required for a new admin.');
      const [u] = await conn.query(
        "INSERT INTO users (email, password_hash, role, full_name, must_change_password) VALUES (?, ?, 'admin', ?, ?)",
        [email, hash, fullName, generated ? 1 : 0]
      );
      // employee_code is unique; default to ADM + user id so it never clashes with the starter ADM001.
      const employeeCode = arg('code', `ADM${String(u.insertId).padStart(3, '0')}`);
      await conn.query(
        'INSERT INTO admins (user_id, employee_code, designation) VALUES (?, ?, ?)',
        [u.insertId, employeeCode, arg('designation', 'Administrator')]
      );
      const [[created]] = await conn.query('SELECT id FROM admins WHERE user_id = ?', [u.insertId]);
      await grantPlatform(conn, created.id);
      return `Admin created (employee code ${employeeCode})`;
    });
    console.log(`${action}: ${email}`);
    if (generated) console.log(`Temporary password (shown once, change it at first sign-in): ${password}`);
  } catch (err) {
    console.error('Could not set up the admin:', err.code === 'ER_DUP_ENTRY' ? 'that employee code is already used (pass --code).' : err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
