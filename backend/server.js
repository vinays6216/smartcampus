const env = require('./src/config/env');
const app = require('./src/app');
const { pool } = require('./src/config/db');
const { startScheduledAnnouncements } = require('./src/utils/scheduledAnnouncements');

(async () => {
  try {
    await pool.query('SELECT 1');
    console.log('MySQL connected');
    app.listen(env.port, () => console.log(`Smart Campus API running on http://localhost:${env.port}`));
    startScheduledAnnouncements(); // notifies scheduled announcements when they go live (checks every minute)
  } catch (err) {
    console.error('Database connection failed:', err.message);
    process.exit(1);
  }
})();
