// HTTP checks that stop before the database: authentication, roles and input validation.
require('./setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { pool } = require('../src/config/db');

let server;
let base;
const token = (role) => jwt.sign({ sub: 1, role, pid: 1 }, process.env.JWT_SECRET, { expiresIn: '5m' });
const call = async (method, path, role, body) => {
  const headers = role ? { Authorization: `Bearer ${token(role)}` } : {};
  if (body) headers['Content-Type'] = 'application/json';
  const r = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};

test.before(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api`;
});
test.after(async () => {
  server.close();
  await pool.end();
});

test('health is public', async () => {
  const r = await call('GET', '/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'ok');
});

test('unknown route is 404', async () => {
  assert.equal((await call('GET', '/no-such-thing')).status, 404);
});

test('protected routes need a token (401)', async () => {
  for (const p of ['/attendance/register?teachingAssignmentId=1&from=2026-01-01&to=2026-01-31', '/timetables/slots', '/dashboard']) {
    assert.equal((await call('GET', p)).status, 401, p);
  }
});

test('a forged token is rejected (401)', async () => {
  const bad = jwt.sign({ sub: 1, role: 'admin', pid: 1 }, 'wrong-secret');
  const r = await fetch(`${base}/dashboard`, { headers: { Authorization: `Bearer ${bad}` } });
  assert.equal(r.status, 401);
});

test('students cannot use lecturer/admin attendance tools (403)', async () => {
  const q = 'teachingAssignmentId=1&from=2026-01-01&to=2026-01-31';
  assert.equal((await call('GET', `/attendance/register?${q}`, 'student')).status, 403);
  assert.equal((await call('GET', `/attendance/report?${q}`, 'student')).status, 403);
  assert.equal((await call('GET', '/attendance/corrections', 'student')).status, 403);
  assert.equal((await call('POST', '/attendance/report/notify-low', 'student', { teachingAssignmentId: 1, from: '2026-01-01', to: '2026-01-31' })).status, 403);
});

test('only admins edit the weekly timetable (403)', async () => {
  const slot = { teachingAssignmentId: 1, dayOfWeek: 1, periodNo: 1, startTime: '09:00', endTime: '10:00' };
  for (const role of ['student', 'lecturer']) {
    assert.equal((await call('POST', '/timetables/slots', role, slot)).status, 403, role);
    assert.equal((await call('DELETE', '/timetables/slots/1', role)).status, 403, role);
  }
});

test('platform routes are closed to lecturers and students (403) and need a token (401)', async () => {
  assert.equal((await call('GET', '/platform/admins')).status, 401);
  for (const role of ['student', 'lecturer']) {
    assert.equal((await call('GET', '/platform/admins', role)).status, 403, role);
    assert.equal((await call('POST', '/platform/admins', role, { email: 'x@y.z', fullName: 'X' })).status, 403, role);
  }
});

test('marking is for lecturers, own summary is for students (403)', async () => {
  assert.equal((await call('POST', '/attendance/sessions', 'student', {})).status, 403);
  assert.equal((await call('GET', '/attendance/student/summary', 'lecturer')).status, 403);
});

test('bad input is rejected before the database (400)', async () => {
  // (admin routes check the admin's permissions in the database first, so they are covered by the smoke test)
  assert.equal((await call('POST', '/attendance/sessions', 'lecturer', { teachingAssignmentId: 1, sessionDate: '17-11-2026' })).status, 400);
  assert.equal((await call('POST', '/attendance/sessions', 'lecturer', { teachingAssignmentId: 1, sessionDate: '2026-11-17', periodNo: 13 })).status, 400);
  assert.equal((await call('GET', '/attendance/register?teachingAssignmentId=1&from=01-01-2026&to=2026-01-31', 'lecturer')).status, 400);
  assert.equal((await call('POST', '/attendance/report/notify-low', 'lecturer', { teachingAssignmentId: 1, from: '2026-01-01', to: '2026-01-31', below: 500 })).status, 400);
  assert.equal((await call('GET', '/attendance/student/summary?from=2026-13-45x', 'student')).status, 400);
});
