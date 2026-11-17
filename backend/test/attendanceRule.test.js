require('./setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const { attendanceRule, summarize } = require('../src/utils/attendanceRule');

test('rule text and minimum', () => {
  const r = attendanceRule();
  assert.equal(r.minRequiredPercent, 75);
  assert.deepEqual(r.attendedStatuses, ['present', 'late']);
  assert.deepEqual(r.excludedStatuses, ['excused']);
});

test('present + late count as attended; excused is not a class held', () => {
  const s = summarize(['present', 'late', 'excused', 'absent']);
  assert.equal(s.total_classes, 3);
  assert.equal(s.attended_classes, 2);
  assert.equal(s.absent_classes, 1);
  assert.equal(s.excused_classes, 1);
  assert.equal(s.attendance_percentage, 66.67);
});

test('missing records (null) are ignored', () => {
  assert.equal(summarize(['present', null, 'absent']).attendance_percentage, 50);
});

test('no classes held gives null, not 0 or NaN', () => {
  assert.equal(summarize([]).attendance_percentage, null);
  assert.equal(summarize(['excused', null]).attendance_percentage, null);
});

test('rounding to two decimals', () => {
  assert.equal(summarize(['present', 'present', 'absent']).attendance_percentage, 66.67);
  assert.equal(summarize(['present', 'absent', 'absent']).attendance_percentage, 33.33);
  assert.equal(summarize(['late', 'late', 'late', 'absent']).attendance_percentage, 75);
});

const { margin } = require('../src/utils/attendanceRule');

test('classes needed to reach 75%', () => {
  assert.deepEqual(margin(2, 3, 75), { toReach: 1, canMiss: 0 });   // 2/3 = 66.7% -> 3/4 = 75%
  assert.deepEqual(margin(5, 10, 75), { toReach: 10, canMiss: 0 }); // 15/20 = 75%
  assert.deepEqual(margin(0, 1, 75), { toReach: 3, canMiss: 0 });
});

test('classes a student can still miss', () => {
  assert.deepEqual(margin(3, 4, 75), { toReach: 0, canMiss: 0 });   // exactly 75%
  assert.deepEqual(margin(9, 10, 75), { toReach: 0, canMiss: 2 });  // 9/12 = 75%
  assert.deepEqual(margin(30, 30, 75), { toReach: 0, canMiss: 10 });
});

test('no classes held -> nothing to say', () => {
  assert.deepEqual(margin(0, 0, 75), { toReach: 0, canMiss: null });
});
