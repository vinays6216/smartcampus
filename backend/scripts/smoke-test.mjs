// End-to-end smoke test of the whole workflow. Run it ONLY against a throwaway database:
// it creates departments, users, classes, attendance, assignments and notifications.
// Needs: database/schema.sql + database/migrations/*.sql loaded, the backend running, and the starter admin's password.
//   API_URL=http://localhost:5099/api ADMIN_PW=<password> npm run smoke
// See backend/README.md "Tests".
const API = process.env.API_URL || 'http://localhost:5099/api';
if (!process.env.ADMIN_PW) { console.error('Set ADMIN_PW (password of admin@smartcampus.local on the throwaway database)'); process.exit(1); }
const results = [];
const ok = (name, cond, extra = '') => { results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };

async function call(method, path, token, body, form) {
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  let payload;
  if (form) payload = form;
  else if (body) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const r = await fetch(API + path, { method, headers, body: payload });
  const j = await r.json().catch(() => ({}));
  if (r.status >= 400) results.push(`  -> ${method} ${path} ${r.status} ${j.message || ''} ${JSON.stringify(j.details || '')}`);
  return { status: r.status, ...j };
}
const login = async (email, password) => (await call('POST', '/auth/login', null, { email, password })).token;
const pdf = () => new Blob(['%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n'], { type: 'application/pdf' });
const today = new Date().toLocaleDateString('en-CA');
const pad = (n) => String(n).padStart(2, '0');
const local = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;

const admin = await login('admin@smartcampus.local', process.env.ADMIN_PW);
ok('admin login (create-admin script)', !!admin);

// Step 1: admin maintains accounts and publishes timetable
const dep = await call('POST', '/academic/departments', admin, { code: 'IT', name: 'Information Technology' });
const prog = await call('POST', '/academic/programs', admin, { departmentId: dep.data.id, code: 'MSCIT', name: 'MSc IT', durationSemesters: 4, specializationStartSem: 3 });
const ay = await call('POST', '/academic/academic-years', admin, { label: '2027-28', startDate: '2027-07-01', endDate: '2028-06-30', isCurrent: true });
const sec = await call('POST', '/academic/sections', admin, { programId: prog.data.id, academicYearId: ay.data.id, semesterNo: 1, name: 'A' });
const subj = await call('POST', '/academic/subjects', admin, { programId: prog.data.id, code: 'IT101', name: 'Data Structures', semesterNo: 1 });
const spz = await call('POST', '/academic/specializations', admin, { programId: prog.data.id, code: 'CYB', name: 'Cyber Security' });
ok('academic setup (department, program, year, section, subject, specialization)', [dep, prog, ay, sec, subj, spz].every((x) => x.status === 201));
const lec = await call('POST', '/admin/lecturers', admin, { email: 'lec@test.local', fullName: 'Test Lecturer', employeeCode: 'EMP01', departmentId: dep.data.id, designation: 'Asst Prof' });
const stu = await call('POST', '/admin/students', admin, { email: 'stu@test.local', fullName: 'Test Student', usn: 'USN001', programId: prog.data.id, sectionId: sec.data.id, gender: 'female' });
ok('admin creates lecturer and student', lec.status === 201 && stu.status === 201);
const ta = await call('POST', '/teaching', admin, { lecturerId: lec.data.id, subjectId: subj.data.id, sectionId: sec.data.id });
ok('teaching assignment', ta.status === 201);
const tf = new FormData();
tf.append('sectionId', String(sec.data.id)); tf.append('title', 'Sem 1 timetable'); tf.append('effectiveFrom', today); tf.append('file', pdf(), 'tt.pdf');
ok('admin publishes timetable', (await call('POST', '/timetables', admin, null, tf)).status === 201);
ok('admin dashboard + counts', (await call('GET', '/dashboard', admin)).status === 200 && (await call('GET', '/admin/dashboard/counts', admin)).status === 200);
ok('admin lists students/lecturers', (await call('GET', '/admin/students', admin)).status === 200 && (await call('GET', '/admin/lecturers', admin)).status === 200);

const lt = await login('lec@test.local', lec.data.temporaryPassword);
const st = await login('stu@test.local', stu.data.temporaryPassword);
ok('lecturer and student login', !!lt && !!st);
ok('/auth/me for all roles', [admin, lt, st].every(Boolean) && (await call('GET', '/auth/me', st)).status === 200 && (await call('GET', '/auth/me', lt)).status === 200 && (await call('GET', '/auth/me', admin)).status === 200);

// Step 2: lecturer records attendance (student absent in period 1, late in period 2, excused in period 3)
const roster = await call('GET', `/teaching/${ta.data.id}/roster?date=${today}&period=1`, lt);
const sid = roster.data.students[0].studentId;
const mark = (p, status) => call('POST', '/attendance/sessions', lt, { teachingAssignmentId: ta.data.id, sessionDate: today, periodNo: p, records: [{ studentId: sid, status }] });
const s1 = await mark(1, 'absent'); const s2 = await mark(2, 'late'); const s3 = await mark(3, 'excused'); const s4 = await mark(4, 'present');
ok('lecturer marks 4 sessions', [s1, s2, s3, s4].every((x) => x.status === 201));
ok('duplicate session rejected (409)', (await mark(1, 'present')).status === 409);

// Step 3: percentage for a date range using the rule (present+late)/(held-excused)
const rep = await call('GET', `/attendance/report?teachingAssignmentId=${ta.data.id}&from=${today}&to=${today}`, lt);
const row = rep.data && rep.data[0];
ok('report: total=3 attended=2 absent=1 pct=66.67', row && row.totalClasses == 3 && row.attendedClasses == 2 && row.absentClasses == 1 && Number(row.attendancePercentage) === 66.67, JSON.stringify(row));
const below = await call('GET', `/attendance/report?teachingAssignmentId=${ta.data.id}&from=${today}&to=${today}&below=50`, lt);
ok('report below=50 filters the student out', Array.isArray(below.data) && below.data.length === 0);
ok('sessions list', (await call('GET', `/attendance/sessions?teachingAssignmentId=${ta.data.id}`, lt)).data.length === 4);

// Step 4: student views
const sum = await call('GET', '/attendance/student/summary', st);
ok('student summary 66.67% and below minimum', Number(sum.data?.overallPercentage) === 66.67 && sum.data.subjects[0].belowMinimum === true, JSON.stringify(sum.data?.subjects?.[0]));
const det = await call('GET', '/attendance/student/detail', st);
ok('student day-by-day detail (4 rows)', det.data?.length === 4);
for (const p of ['/timetables', '/materials', '/announcements', '/calendar', '/notifications', '/notifications/unread-count', '/dashboard', '/auth/profile'])
  { const r = await call('GET', p, st); if (p !== '/auth/profile') ok(`student GET ${p}`, r.status === 200); }

// Step 5: attendance issue -> decision -> logged correction
const absentRec = det.data.find((d) => d.status === 'absent');
const iform = new FormData(); iform.append('attendanceRecordId', String(absentRec.attendanceRecordId)); iform.append('reason', 'I was present in class');
const issue = await call('POST', '/attendance/issues', st, null, iform);
ok('student raises issue', issue.status === 201);
ok('issue shows in detail view', (await call('GET', '/attendance/student/detail', st)).data.find((d) => d.attendanceRecordId === absentRec.attendanceRecordId)?.issueStatus === 'open');
ok('lecturer lists issues', (await call('GET', '/attendance/issues?status=open', lt)).data?.length === 1);
ok('lecturer approves issue', (await call('PATCH', `/attendance/issues/${issue.data.id}/resolve`, lt, { decision: 'approve', remarks: 'Verified' })).status === 200);
const sum2 = await call('GET', '/attendance/student/summary', st);
ok('percentage updates to 100 after approval', Number(sum2.data?.overallPercentage) === 100);
ok('lecturer edits records (history via trigger)', (await call('PUT', `/attendance/sessions/${s4.data.sessionId}/records`, lt, { records: [{ studentId: sid, status: 'absent' }], reason: 'Left early' })).status === 200);
ok('student sees issue decision', (await call('GET', '/attendance/issues/mine', st)).data?.[0]?.status === 'approved');

// Step 6: assignment with deadline; URL and PDF submissions with time
const dl = new Date(Date.now() + 2 * 3600 * 1000);
const af = new FormData(); af.append('teachingAssignmentId', String(ta.data.id)); af.append('title', 'Linked lists'); af.append('deadline', local(dl)); af.append('maxMarks', '10');
const asg = await call('POST', '/assignments/manage', lt, null, af);
ok('lecturer creates draft', asg.status === 201);
ok('lecturer publishes (sp_publish_assignment)', (await call('POST', `/assignments/manage/${asg.data.id}/publish`, lt)).status === 200);
const slist = await call('GET', '/assignments/student', st);
ok('student sees assignment as "Due soon"', slist.data?.[0]?.displayStatus === 'Due soon', JSON.stringify(slist.data?.[0]));
ok('student alerts', (await call('GET', '/assignments/student/alerts', st)).data?.dueSoon?.length === 1);
ok('student submits URL', (await call('POST', `/assignments/student/${asg.data.id}/submit-url`, st, { url: 'https://example.com/work' })).status === 200);
const sf = new FormData(); sf.append('file', pdf(), 'answer.pdf');
ok('student submits PDF', (await call('POST', `/assignments/student/${asg.data.id}/submit-file`, st, null, sf)).status === 200);
const sd = await call('GET', `/assignments/student/${asg.data.id}`, st);
ok('submission status + time recorded', sd.data?.submissionStatus === 'submitted' && !!sd.data.submittedAt && sd.data.myFiles.length === 1);
const subs = await call('GET', `/assignments/manage/${asg.data.id}/submissions`, lt);
ok('lecturer sees submission', subs.summary?.submitted === 1);
ok('lecturer grades', (await call('PATCH', `/assignments/manage/submissions/${subs.data[0].id}/grade`, lt, { marks: 9, feedback: 'Good' })).status === 200);
ok('student dashboard counts', (await call('GET', '/dashboard', st)).data?.assignments?.submitted == 1);

// Step 7: announcements and calendar events to relevant users
const ann = await call('POST', '/announcements', lt, { title: 'Extra class', body: 'Extra class on Saturday', audienceType: 'section', sectionId: sec.data.id, event: { eventType: 'extra_class', eventDate: today, startTime: '10:00', endTime: '11:00' } });
ok('lecturer posts section announcement + event', ann.status === 201);
const adminAnn = await call('POST', '/announcements', admin, { title: 'Holiday', body: 'Campus closed', audienceType: 'all', priority: 'important' });
ok('admin posts campus announcement', adminAnn.status === 201);
ok('student sees 2 announcements', (await call('GET', '/announcements', st)).data?.length === 2);
const cal = await call('POST', '/calendar', admin, { title: 'Exam', eventType: 'exam', eventDate: today });
ok('admin creates calendar event', cal.status === 201);
ok('student calendar shows 2 events', (await call('GET', '/calendar', st)).data?.length === 2);
ok('student has notifications', (await call('GET', '/notifications/unread-count', st)).data?.count >= 4);
ok('lecturer dashboard', (await call('GET', '/dashboard', lt)).status === 200);
ok('materials upload by lecturer', (await (async () => { const m = new FormData(); m.append('teachingAssignmentId', String(ta.data.id)); m.append('title', 'Unit 1 notes'); m.append('file', pdf(), 'u1.pdf'); return call('POST', '/materials', lt, null, m); })()).status === 201);
ok('student downloads own material file', (await fetch(`${API}/files/${(await call('GET', '/materials', st)).data[0].fileId}`, { headers: { Authorization: `Bearer ${st}` } })).status === 200);

// ---------------- New features (P1-P4) ----------------
results.push('--- P1 date range + rule');
const yesterday = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toLocaleDateString('en-CA'); })();
const rToday = await call('GET', `/attendance/student/summary?from=${today}&to=${today}`, st);
ok('P1 summary for today has rule text + range', !!rToday.data?.rule?.text && rToday.data.from === today && rToday.data.subjects.length === 1, rToday.data?.rule?.text);
const rYest = await call('GET', `/attendance/student/summary?from=${yesterday}&to=${yesterday}`, st);
ok('P1 summary for yesterday is empty', rYest.data?.subjects?.length === 0 && rYest.data.overallPercentage === null);
ok('P1 inverted range rejected (400)', (await call('GET', `/attendance/student/summary?from=${today}&to=${yesterday}`, st)).status === 400);
ok('P1 bad date format rejected (400)', (await call('GET', '/attendance/student/summary?from=17-11-2026', st)).status === 400);
const rep2 = await call('GET', `/attendance/report?teachingAssignmentId=${ta.data.id}&from=${today}&to=${today}`, lt);
ok('P1 report returns rule', rep2.rule?.minRequiredPercent === 75);
ok('P1 student and lecturer agree for same range', Number(rep2.data?.[0]?.attendancePercentage) === Number(rToday.data?.subjects?.[0]?.attendancePercentage),
  `${rep2.data?.[0]?.attendancePercentage} vs ${rToday.data?.subjects?.[0]?.attendancePercentage}`);

results.push('--- P2 correction log');
const corr = await call('GET', '/attendance/corrections', lt);
ok('P2 lecturer sees 2 logged changes', corr.data?.length === 2, JSON.stringify(corr.data?.map((c) => [c.oldStatus, c.newStatus, c.changedByName, c.reason, c.issueId])));
ok('P2 approved change linked to issue', corr.data?.some((c) => c.issueId === issue.data.id && c.newStatus === 'present'));
ok('P2 admin sees log', (await call('GET', '/attendance/corrections', admin)).data?.length === 2);
ok('P2 student cannot open log (403)', (await call('GET', '/attendance/corrections', st)).status === 403);
ok('P2 date filter (yesterday) empty', (await call('GET', `/attendance/corrections?from=${yesterday}&to=${yesterday}`, lt)).data?.length === 0);
const mine = await call('GET', '/attendance/issues/mine', st);
ok('P2 student issue shows who corrected', mine.data?.[0]?.resolvedByName === 'Test Lecturer' && mine.data[0].currentStatus === 'present', JSON.stringify(mine.data?.[0]));

results.push('--- P6 register + copy last class');
const reg = await call('GET', `/attendance/register?teachingAssignmentId=${ta.data.id}&from=${today}&to=${today}`, lt);
const rr = reg.data?.students?.find((x) => x.studentId === sid);
ok('P6 register: 4 classes, statuses in period order', reg.data?.sessions?.length === 4 && JSON.stringify(rr?.statuses) === JSON.stringify(['present', 'late', 'excused', 'absent']), JSON.stringify(rr?.statuses));
ok('P6 register totals match report rule', rr?.totalClasses === 3 && rr.attendedClasses === 2 && rr.excusedClasses === 1 && rr.attendancePercentage === Number(rep2.data?.[0]?.attendancePercentage), JSON.stringify(rr));
ok('P6 register returns rule', !!reg.rule?.text);
ok('P6 admin can read register', (await call('GET', `/attendance/register?teachingAssignmentId=${ta.data.id}&from=${today}&to=${today}`, admin)).status === 200);
ok('P6 student cannot read register (403)', (await call('GET', `/attendance/register?teachingAssignmentId=${ta.data.id}&from=${today}&to=${today}`, st)).status === 403);
ok('P6 register inverted range (400)', (await call('GET', `/attendance/register?teachingAssignmentId=${ta.data.id}&from=${today}&to=${yesterday}`, lt)).status === 400);
const regEmpty = await call('GET', `/attendance/register?teachingAssignmentId=${ta.data.id}&from=${yesterday}&to=${yesterday}`, lt);
ok('P6 register empty range: no sessions, roster still listed', regEmpty.data?.sessions?.length === 0 && regEmpty.data.students.length === 1);
const prev = await call('GET', `/attendance/sessions/previous?teachingAssignmentId=${ta.data.id}&date=${today}&period=5`, lt);
ok('P6 previous class = period 4 (absent)', prev.data?.periodNo === 4 && prev.data.records?.[0]?.status === 'absent', JSON.stringify(prev.data));
ok('P6 no class before period 1 -> null', (await call('GET', `/attendance/sessions/previous?teachingAssignmentId=${ta.data.id}&date=${today}&period=1`, lt)).data === null);

results.push('--- Q1 weekly timetable grid');
const slot = (taId, day, p, startTime, endTime, extra = {}) => ({ teachingAssignmentId: taId, dayOfWeek: day, periodNo: p, startTime, endTime, ...extra });
const sl1 = await call('POST', '/timetables/slots', admin, slot(ta.data.id, 1, 1, '09:00', '10:00', { room: 'LH-101' }));
ok('Q1 admin adds Mon P1', sl1.status === 201);
ok('Q1 same section/day/period taken (409)', (await call('POST', '/timetables/slots', admin, slot(ta.data.id, 1, 1, '09:00', '10:00'))).status === 409);
ok('Q1 end before start (400)', (await call('POST', '/timetables/slots', admin, slot(ta.data.id, 2, 1, '10:00', '09:00'))).status === 400);
ok('Q1 lecturer cannot add (403)', (await call('POST', '/timetables/slots', lt, slot(ta.data.id, 3, 1, '09:00', '10:00'))).status === 403);
const secB = await call('POST', '/academic/sections', admin, { programId: prog.data.id, academicYearId: ay.data.id, semesterNo: 1, name: 'B' });
const taB = await call('POST', '/teaching', admin, { lecturerId: lec.data.id, subjectId: subj.data.id, sectionId: secB.data.id });
ok('Q1 second section for the same lecturer', secB.status === 201 && taB.status === 201);
ok('Q1 lecturer double-booked across sections (409)', (await call('POST', '/timetables/slots', admin, slot(taB.data.id, 1, 2, '09:30', '10:30'))).status === 409);
const sl2 = await call('POST', '/timetables/slots', admin, slot(taB.data.id, 1, 2, '10:00', '11:00'));
ok('Q1 back-to-back class in section B allowed', sl2.status === 201);
const stSlots = await call('GET', '/timetables/slots', st);
ok('Q1 student sees only own section', stSlots.data?.length === 1 && stSlots.data[0].subjectCode === 'IT101' && stSlots.data[0].room === 'LH-101', JSON.stringify(stSlots.data));
ok('Q1 lecturer sees own classes in both sections', (await call('GET', '/timetables/slots', lt)).data?.length === 2);
ok('Q1 admin filters by section', (await call('GET', `/timetables/slots?sectionId=${secB.data.id}`, admin)).data?.length === 1);
ok('Q1 admin edits slot (moves to Tue)', (await call('PUT', `/timetables/slots/${sl2.data.id}`, admin, slot(taB.data.id, 2, 2, '10:00', '11:00', { room: 'LH-2' }))).status === 200);
ok('Q1 re-saving a slot is allowed; edited period stays taken (409)', (await call('PUT', `/timetables/slots/${sl1.data.id}`, admin, slot(ta.data.id, 1, 1, '09:00', '10:00'))).status === 200
  && (await call('POST', '/timetables/slots', admin, slot(taB.data.id, 2, 2, '10:00', '11:00'))).status === 409);
ok('Q1 admin deletes slot', (await call('DELETE', `/timetables/slots/${sl2.data.id}`, admin)).status === 200
  && (await call('DELETE', `/timetables/slots/${sl2.data.id}`, admin)).status === 404);

results.push('--- Q2 low-attendance alerts');
const nl = await call('POST', '/attendance/report/notify-low', lt, { teachingAssignmentId: ta.data.id, from: today, to: today });
ok('Q2 student below 75% notified', nl.status === 200 && nl.data?.notified === 1, JSON.stringify(nl));
const lowN = ((await call('GET', '/notifications', st)).data || []).find((n) => n.title === 'Low attendance in IT101');
ok('Q2 notification shows the student\'s %', !!lowN && lowN.message.includes('66.67%'), lowN?.message);
ok('Q2 limit 50% -> nobody notified', (await call('POST', '/attendance/report/notify-low', lt, { teachingAssignmentId: ta.data.id, from: today, to: today, below: 50 })).data?.notified === 0);
ok('Q2 student cannot send (403)', (await call('POST', '/attendance/report/notify-low', st, { teachingAssignmentId: ta.data.id, from: today, to: today })).status === 403);

results.push('--- A platform admin + permissions');
const meA = await call('GET', '/auth/me', admin);
ok('A starter admin is platform admin with all areas', meA.data?.isPlatformAdmin === true && meA.data.permissions?.length === 6, JSON.stringify(meA.data?.permissions));
const lim = await call('POST', '/platform/admins', admin, { email: 'att.admin@test.local', fullName: 'Attendance Admin', permissions: ['attendance'] });
ok('A platform admin creates a limited admin', lim.status === 201 && !!lim.data?.temporaryPassword);
const la = await login('att.admin@test.local', lim.data.temporaryPassword);
const meL = await call('GET', '/auth/me', la);
ok('A limited admin: only "attendance"', meL.data?.isPlatformAdmin === false && JSON.stringify(meL.data.permissions) === '["attendance"]');
ok('A limited admin can use attendance', (await call('GET', `/attendance/report?teachingAssignmentId=${ta.data.id}&from=${today}&to=${today}`, la)).status === 200);
ok('A limited admin blocked from students (403)', (await call('GET', '/admin/students', la)).status === 403);
ok('A limited admin blocked from academic writes (403)', (await call('POST', '/academic/departments', la, { code: 'XX', name: 'Nope' })).status === 403);
ok('A limited admin blocked from timetable writes (403)', (await call('POST', '/timetables/slots', la, { teachingAssignmentId: ta.data.id, dayOfWeek: 5, periodNo: 5, startTime: '14:00', endTime: '15:00' })).status === 403);
ok('A limited admin blocked from announcements (403)', (await call('POST', '/announcements', la, { title: 'x', body: 'y', audienceType: 'all' })).status === 403);
ok('A limited admin blocked from platform (403)', (await call('GET', '/platform/admins', la)).status === 403);
ok('A limited admin still sees dashboard counts', (await call('GET', '/admin/dashboard/counts', la)).status === 200);
ok('A lecturer blocked from platform (403)', (await call('GET', '/platform/admins', lt)).status === 403);
ok('A grant "users" -> works at once', (await call('PUT', `/platform/admins/${lim.data.id}/permissions`, admin, { permissions: ['attendance', 'users'] })).status === 200
  && (await call('GET', '/admin/students', la)).status === 200);
ok('A list shows permissions', (await call('GET', '/platform/admins', admin)).data?.find((a) => a.id === lim.data.id)?.permissions?.length === 2);
ok('A cannot drop own platform rights (400)', (await call('PUT', `/platform/admins/${meA.data.profile.id}/permissions`, admin, { permissions: ['users'] })).status === 400);
ok('A cannot deactivate self (400)', (await call('PATCH', `/platform/admins/${meA.data.profile.id}/status`, admin, { status: 'inactive' })).status === 400);
ok('A bad permission name (400)', (await call('PUT', `/platform/admins/${lim.data.id}/permissions`, admin, { permissions: ['everything'] })).status === 400);
ok('A reset password gives a new one', !!(await call('POST', `/platform/admins/${lim.data.id}/reset-password`, admin)).data?.temporaryPassword);
ok('A deactivate -> blocked at once and at login', (await call('PATCH', `/platform/admins/${lim.data.id}/status`, admin, { status: 'inactive' })).status === 200
  && (await call('GET', `/attendance/report?teachingAssignmentId=${ta.data.id}&from=${today}&to=${today}`, la)).status === 403
  && (await call('POST', '/auth/login', null, { email: 'att.admin@test.local', password: lim.data.temporaryPassword })).status !== 200);

results.push('--- B attendance editing');
const s1rec = (await call('GET', `/attendance/sessions/${s1.data.sessionId}`, lt)).data;
ok('B admin edit without reason (400)', (await call('PUT', `/attendance/sessions/${s1.data.sessionId}/records`, admin, { records: [{ studentId: sid, status: 'late' }] })).status === 400);
ok('B admin edit with reason', (await call('PUT', `/attendance/sessions/${s1.data.sessionId}/records`, admin, { records: [{ studentId: sid, status: 'late' }], reason: 'Arrived 10 min late' })).status === 200);
const corrA = (await call('GET', '/attendance/corrections', admin)).data || [];
ok('B admin edit is logged with name + reason', corrA.some((c) => c.changedByRole === 'admin' && c.newStatus === 'late' && c.reason === 'Arrived 10 min late'), JSON.stringify(corrA[0]));
ok('B register reflects the edit', (await call('GET', `/attendance/register?teachingAssignmentId=${ta.data.id}&from=${today}&to=${today}`, lt)).data?.students?.[0]?.statuses?.[0] === 'late');
ok('B register tells the UI the edit rules', (await call('GET', `/attendance/register?teachingAssignmentId=${ta.data.id}&from=${today}&to=${today}`, admin)).editing?.reasonRequired === true);
const old = (() => { const d = new Date(); d.setDate(d.getDate() - 40); return d.toLocaleDateString('en-CA'); })();
const oldS = await call('POST', '/attendance/sessions', lt, { teachingAssignmentId: ta.data.id, sessionDate: old, periodNo: 1 });
ok('B lecturer marks a 40-day-old class', oldS.status === 201);
ok('B lecturer cannot edit it after 30 days (403)', (await call('PUT', `/attendance/sessions/${oldS.data.sessionId}/records`, lt, { records: [{ studentId: sid, status: 'absent' }] })).status === 403);
ok('B lecturer cannot delete it after 30 days (403)', (await call('DELETE', `/attendance/sessions/${oldS.data.sessionId}`, lt, { reason: 'Wrong date' })).status === 403);
ok('B delete without reason (400)', (await call('DELETE', `/attendance/sessions/${oldS.data.sessionId}`, admin, {})).status === 400);
ok('B admin deletes the old class', (await call('DELETE', `/attendance/sessions/${oldS.data.sessionId}`, admin, { reason: 'Marked on the wrong date' })).status === 200
  && (await call('GET', `/attendance/sessions/${oldS.data.sessionId}`, admin)).status === 404);
const ySes = await call('POST', '/attendance/sessions', lt, { teachingAssignmentId: ta.data.id, sessionDate: yesterday, periodNo: 1, records: [{ studentId: sid, status: 'absent' }] });
const yRec = (await call('GET', `/attendance/student/detail?from=${yesterday}&to=${yesterday}`, st)).data?.[0];
const yf = new FormData(); yf.append('attendanceRecordId', String(yRec.attendanceRecordId)); yf.append('reason', 'I was in class yesterday');
const yIssue = await call('POST', '/attendance/issues', st, null, yf);
ok('B open issue blocks delete (409)', ySes.status === 201 && yIssue.status === 201 && (await call('DELETE', `/attendance/sessions/${ySes.data.sessionId}`, lt, { reason: 'Wrong period' })).status === 409);
ok('B after the decision the lecturer can delete it', (await call('PATCH', `/attendance/issues/${yIssue.data.id}/resolve`, lt, { decision: 'reject', remarks: 'Checked' })).status === 200
  && (await call('DELETE', `/attendance/sessions/${ySes.data.sessionId}`, lt, { reason: 'Wrong period' })).status === 200);
ok('B student summary for yesterday is empty again', (await call('GET', `/attendance/student/summary?from=${yesterday}&to=${yesterday}`, st)).data?.subjects?.length === 0);
ok('B student cannot delete (403)', (await call('DELETE', `/attendance/sessions/${s1.data.sessionId}`, st, { reason: 'nope' })).status === 403);

results.push('--- F1 classes needed');
// today: P1 late, P2 late, P3 excused, P4 absent -> 2 of 3 held -> one more class reaches 75%
const f1 = await call('GET', `/attendance/student/summary?from=${today}&to=${today}`, st);
ok('F1 subject: attend 1 more to reach 75%', f1.data?.subjects?.[0]?.classesToReach === 1 && f1.data.subjects[0].canMiss === 0, JSON.stringify(f1.data?.subjects?.[0]));
ok('F1 overall margin', f1.data?.overall?.toReach === 1, JSON.stringify(f1.data?.overall));

results.push('--- F2 leave requests');
const lf = (from, to, type = 'medical', reason = 'Fever, doctor note attached') => { const f = new FormData(); f.append('fromDate', from); f.append('toDate', to); f.append('leaveType', type); f.append('reason', reason); return f; };
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('en-CA'); };
const lv = lf(today, today); lv.append('proof', pdf(), 'note.pdf');
const leave1 = await call('POST', '/leave', st, null, lv);
ok('F2 student asks for leave (with proof)', leave1.status === 201);
ok('F2 overlapping leave (409)', (await call('POST', '/leave', st, null, lf(today, today))).status === 409);
ok('F2 inverted dates (400)', (await call('POST', '/leave', st, null, lf(today, yesterday))).status === 400);
ok('F2 too far in the past (400)', (await call('POST', '/leave', st, null, lf(daysAgo(60), daysAgo(59)))).status === 400);
ok('F2 lecturers notified', ((await call('GET', '/notifications', lt)).data || []).some((n) => n.title === 'New leave request'));
const openL = await call('GET', '/leave?status=open', lt);
ok('F2 lecturer sees the open request', openL.data?.length === 1 && openL.data[0].usn === 'USN001' && !!openL.data[0].proofFileId);
ok('F2 lecturer can open the proof file', (await fetch(`${API}/files/${openL.data[0].proofFileId}`, { headers: { Authorization: `Bearer ${lt}` } })).status === 200);
ok('F2 student cannot list staff view (403)', (await call('GET', '/leave', st)).status === 403);
const appr = await call('PATCH', `/leave/${leave1.data.id}/decide`, lt, { decision: 'approve', remarks: 'Get well soon' });
ok('F2 approve -> today\'s absent mark excused', appr.status === 200 && appr.data?.excused === 1, JSON.stringify(appr));
ok('F2 decided twice (409)', (await call('PATCH', `/leave/${leave1.data.id}/decide`, lt, { decision: 'reject' })).status === 409);
const f2sum = await call('GET', `/attendance/student/summary?from=${today}&to=${today}`, st);
ok('F2 student % now 100 (excused not counted)', Number(f2sum.data?.subjects?.[0]?.attendancePercentage) === 100, JSON.stringify(f2sum.data?.subjects?.[0]));
ok('F2 correction logged with leave reason', ((await call('GET', '/attendance/corrections', lt)).data || []).some((c) => c.newStatus === 'excused' && c.reason === `Leave #${leave1.data.id} approved`));
const s6 = await call('POST', '/attendance/sessions', lt, { teachingAssignmentId: ta.data.id, sessionDate: today, periodNo: 6 });
const s6rec = (await call('GET', `/attendance/sessions/${s6.data?.sessionId}`, lt)).data?.records?.[0];
ok('F2 class marked during leave starts as excused', s6rec?.status === 'excused' && /On leave/.test(s6rec.remarks || ''), JSON.stringify(s6rec));
ok('F2 student told about the decision', ((await call('GET', '/notifications', st)).data || []).some((n) => n.title === 'Leave approved'));
const mineL = (await call('GET', '/leave/mine', st)).data?.[0];
ok('F2 student sees approved + who decided', mineL?.status === 'approved' && mineL.decidedByName === 'Test Lecturer' && mineL.excusedCount === 1);
const leave2 = await call('POST', '/leave', st, null, lf(daysAgo(3), daysAgo(2), 'personal', 'Family function'));
ok('F2 reject with remarks', (await call('PATCH', `/leave/${leave2.data.id}/decide`, admin, { decision: 'reject', remarks: 'No proof' })).status === 200);
const leave3 = await call('POST', '/leave', st, null, lf(daysAgo(10), daysAgo(10), 'event', 'Inter-college fest'));
ok('F2 student withdraws open request', (await call('PATCH', `/leave/${leave3.data.id}/withdraw`, st)).status === 200
  && (await call('PATCH', `/leave/${leave3.data.id}/withdraw`, st)).status === 404);
await call('DELETE', `/attendance/sessions/${s6.data.sessionId}`, lt, { reason: 'Test class removed' });

results.push('--- F3 activity log');
const act = await call('GET', '/platform/activity', admin);
ok('F3 activity lists actions with who did them', act.status === 200 && act.data?.length > 0 && act.actions?.includes('LEAVE_APPROVED') && act.actions.includes('ADMIN_CREATED'), JSON.stringify(act.actions));
const actL = await call('GET', '/platform/activity?action=LEAVE_APPROVED', admin);
ok('F3 filter by action', actL.data?.length === 1 && actL.data[0].userName === 'Test Lecturer' && actL.data[0].newValues?.excused === 1, JSON.stringify(actL.data?.[0]));
ok('F3 search by text', ((await call('GET', '/platform/activity?q=ATTENDANCE_SESSION', admin)).data || []).every((r) => r.action.includes('ATTENDANCE_SESSION')));
ok('F3 paging', (await call('GET', '/platform/activity?limit=2&page=1', admin)).data?.length === 2 && (await call('GET', '/platform/activity?limit=2', admin)).pagination?.total >= 5);
ok('F3 lecturer cannot read (403)', (await call('GET', '/platform/activity', lt)).status === 403);

results.push('--- P3 calendar edit, upcoming, scheduled announcements');
const evs = (await call('GET', '/calendar', lt)).data || [];
const lecEvent = evs.find((e) => e.createdBy && e.title === 'Extra class');
const adminEvent = evs.find((e) => e.title === 'Exam');
ok('P3 calendar list has createdBy', !!lecEvent && !!adminEvent);
ok('P3 lecturer edits own event', (await call('PUT', `/calendar/${lecEvent.id}`, lt, { title: 'Extra class (moved)', startTime: '14:00', endTime: '15:00' })).status === 200);
ok('P3 lecturer cannot edit admin event (403)', (await call('PUT', `/calendar/${adminEvent.id}`, lt, { title: 'Hacked' })).status === 403);
ok('P3 end before start rejected on edit (400)', (await call('PUT', `/calendar/${lecEvent.id}`, lt, { startTime: '16:00', endTime: '15:00' })).status === 400);
ok('P3 end before start rejected on create (400)', (await call('POST', '/calendar', admin, { title: 'Bad times', eventType: 'event', eventDate: today, startTime: '10:00', endTime: '09:00' })).status === 400);
ok('P3 admin clears location', (await call('PUT', `/calendar/${adminEvent.id}`, admin, { location: '' })).status === 200);
const evAfter = (await call('GET', '/calendar', st)).data?.find((e) => e.id === lecEvent.id);
ok('P3 student sees edited event', evAfter?.title === 'Extra class (moved)' && evAfter.startTime.startsWith('14:00'));
for (const [who, tok] of [['student', st], ['lecturer', lt], ['admin', admin]]) {
  const up = await call('GET', '/dashboard/upcoming', tok);
  ok(`P3 upcoming for ${who}`, up.status === 200 && Array.isArray(up.data?.events) && Array.isArray(up.data?.deadlines) && up.data.events.length >= 1,
    `events=${up.data?.events?.length} deadlines=${up.data?.deadlines?.length}`);
}
const unreadBefore = (await call('GET', '/notifications/unread-count', st)).data.count;
const later = new Date(Date.now() + 5000);
const sched = await call('POST', '/announcements', admin, { title: 'Scheduled notice', body: 'Goes live in a few seconds', audienceType: 'students', publishAt: later.toISOString() });
ok('P3 scheduled announcement created', sched.status === 201);
ok('P3 not notified before publish time', (await call('GET', '/notifications/unread-count', st)).data.count === unreadBefore);
let notified = false;
for (let i = 0; i < 16 && !notified; i++) {
  await new Promise((r) => setTimeout(r, 5000));
  const list = (await call('GET', '/notifications', st)).data || [];
  notified = list.some((n) => n.title === 'Scheduled notice');
}
ok('P3 scheduled announcement notified after publish time (<= 80 s)', notified);
await new Promise((r) => setTimeout(r, 61000));
const count = ((await call('GET', '/notifications', st, null)).data || []).filter((n) => n.title === 'Scheduled notice').length;
ok('P3 notified exactly once after another check', count === 1, `count=${count}`);

results.push('--- P4 submission timing');
const sd2 = await call('GET', `/assignments/student/${asg.data.id}`, st);
ok('P4 submission has time and on-time flag', !!sd2.data?.submittedAt && sd2.data.isLate === 0);

console.log(results.join('\n'));
const fails = results.filter((r) => r.startsWith('FAIL')).length;
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length} passed, ${fails} failed`);
process.exitCode = fails ? 1 : 0;
