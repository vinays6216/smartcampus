require('./setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const { dateStr, timeStr, id, bool } = require('../src/utils/zodHelpers');

test('dateStr accepts YYYY-MM-DD only', () => {
  assert.ok(dateStr.safeParse('2026-11-17').success);
  assert.ok(!dateStr.safeParse('17-11-2026').success);
  assert.ok(!dateStr.safeParse('2026/11/17').success);
});

test('timeStr accepts HH:MM and HH:MM:SS within a day', () => {
  for (const t of ['00:00', '09:30', '23:59', '10:15:00']) assert.ok(timeStr.safeParse(t).success, t);
  for (const t of ['24:00', '9:30', '12:60', 'noon']) assert.ok(!timeStr.safeParse(t).success, t);
});

test('id coerces positive integers', () => {
  assert.equal(id.parse('12'), 12);
  assert.ok(!id.safeParse('0').success);
  assert.ok(!id.safeParse('abc').success);
});

test('bool reads form strings', () => {
  assert.equal(bool(false).parse('true'), true);
  assert.equal(bool(false).parse('0'), false);
  assert.equal(bool(true).parse(undefined), true);
});
