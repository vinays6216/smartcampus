const mysql = require('mysql2/promise');
const env = require('./env');

const pool = mysql.createPool({
  ...env.db,
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true,      // DATE / DATETIME come back as plain strings (no timezone shifts)
  decimalNumbers: true,   // DECIMAL / SUM() come back as numbers instead of strings
  charset: 'utf8mb4',
});

// Runs fn(conn) inside a transaction. Commits on success, rolls back on any error.
async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, withTransaction };
