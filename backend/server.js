const env = require('./src/config/env');
const app = require('./src/app');
const { pool } = require('./src/config/db');

(async () => {
  try {
    await pool.query('SELECT 1');
    console.log('MySQL connected');
    app.listen(env.port, () => console.log(`Smart Campus API running on http://localhost:${env.port}`));
  } catch (err) {
    console.error('Database connection failed:', err.message);
    process.exit(1);
  }
})();
