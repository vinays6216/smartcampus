// Test environment. Runs from a temp folder so backend/.env is never read, and uses fake settings only.
// No test opens a database connection (the mysql2 pool connects lazily).
const os = require('os');

process.chdir(os.tmpdir());
Object.assign(process.env, {
  NODE_ENV: 'test',
  DB_HOST: '127.0.0.1', DB_PORT: '1', DB_USER: 'test', DB_PASSWORD: '', DB_NAME: 'test',
  JWT_SECRET: 'unit-test-secret-not-used-anywhere-else',
  UPLOAD_DIR: os.tmpdir(),
  ATTENDANCE_MIN_PERCENT: '75',
});
