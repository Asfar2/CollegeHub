import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Configure an isolated environment before the app (and its database) is loaded.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-test-'));
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret';
process.env.DB_PATH = path.join(tmp, 'test.db');
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');
process.env.GEMINI_API_KEY = '';
process.env.GROQ_API_KEY = ''; // never call a real AI provider from tests
process.env.AI_PROVIDER = 'groq';
process.env.NODE_ENV = 'test';

const { app } = await import('../src/app.js');
const { db } = await import('../src/db.js');
const bcrypt = (await import('bcryptjs')).default;

let server, base, adminToken, studentToken;

const call = async (route, { method = 'GET', token, json, form } = {}) => {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (json) headers['Content-Type'] = 'application/json';
  const res = await fetch(base + route, { method, headers, body: json ? JSON.stringify(json) : form });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body };
};

before(async () => {
  db.prepare("INSERT INTO users (role, enrollment, name, password_hash) VALUES ('admin', 'admin', 'Test Admin', ?)")
    .run(bcrypt.hashSync('AdminPass123', 4));
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('health check is public', async () => {
  const r = await call('/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'ok');
});

test('protected routes require a token', async () => {
  assert.equal((await call('/files')).status, 401);
  assert.equal((await call('/files', { token: 'garbage' })).status, 401);
});

test('login rejects bad credentials with a generic message', async () => {
  const r = await call('/auth/login', { method: 'POST', json: { enrollment: 'admin', password: 'wrong' } });
  assert.equal(r.status, 401);
  const ghost = await call('/auth/login', { method: 'POST', json: { enrollment: 'nobody', password: 'wrong' } });
  assert.equal(ghost.body.error, r.body.error);
});

test('admin can log in', async () => {
  const r = await call('/auth/login', { method: 'POST', json: { enrollment: 'admin', password: 'AdminPass123' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.user.role, 'admin');
  adminToken = r.body.token;
});

test('admin registers a student; weak passwords are rejected', async () => {
  const weak = await call('/students', { method: 'POST', token: adminToken, json: { enrollment: 'S1001', name: 'Asha Rao', password: 'short' } });
  assert.equal(weak.status, 400);
  const ok = await call('/students', { method: 'POST', token: adminToken, json: { enrollment: 'S1001', name: 'Asha Rao', password: 'StudentPass1', program: 'dsai-c' } });
  assert.equal(ok.status, 201);
});

test('student can log in but cannot use admin routes', async () => {
  const login = await call('/auth/login', { method: 'POST', json: { enrollment: 'S1001', password: 'StudentPass1' } });
  assert.equal(login.status, 200);
  studentToken = login.body.token;
  assert.equal((await call('/students', { token: studentToken })).status, 403);
  const form = new FormData();
  form.append('section', 'news');
  form.append('title', 'Sneaky upload');
  form.append('url', 'https://example.com');
  assert.equal((await call('/files', { method: 'POST', token: studentToken, form })).status, 403);
});

test('admin publishes a link and a file; students can see and download them', async () => {
  const link = new FormData();
  link.append('section', 'cal');
  link.append('title', 'Academic Calendar');
  link.append('url', 'https://example.com/calendar.pdf');
  const l = await call('/files', { method: 'POST', token: adminToken, form: link });
  assert.equal(l.status, 201);

  const file = new FormData();
  file.append('section', 'news');
  file.append('title', 'Holiday notice');
  file.append('course_code', 'cs 301');
  file.append('course_name', 'Campus Life');
  file.append('file', new Blob(['Campus is closed on Friday for Founders Day. All classes resume on Monday morning as normal.'], { type: 'text/plain' }), 'notice.txt');
  const f = await call('/files', { method: 'POST', token: adminToken, form: file });
  assert.equal(f.status, 201);
  assert.equal(f.body.course_code, 'CS301');
  assert.equal(f.body.indexed, 1);

  const list = await call('/files?section=news', { token: studentToken });
  assert.equal(list.body.files.length, 1);
  assert.equal(list.body.files[0].title, 'Holiday notice');

  const dl = await call(`/files/${f.body.id}/download`, { token: studentToken });
  assert.equal(dl.status, 200);
  assert.match(dl.body, /Founders Day/);
});

test('files can be found by course code and previewed inline', async () => {
  const found = await call('/files?q=cs301', { token: studentToken });
  assert.equal(found.body.files.length, 1);
  const id = found.body.files[0].id;

  const res = await fetch(`${base}/files/${id}/view`, { headers: { Authorization: `Bearer ${studentToken}` } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-disposition'), /^inline/);

  const linkId = (await call('/files?section=cal', { token: studentToken })).body.files[0].id;
  assert.equal((await call(`/files/${linkId}/view`, { token: studentToken })).status, 400);
});

test('disallowed file types are rejected', async () => {
  const form = new FormData();
  form.append('section', 'news');
  form.append('title', 'Bad file');
  form.append('file', new Blob(['MZ'], { type: 'application/octet-stream' }), 'virus.exe');
  const r = await call('/files', { method: 'POST', token: adminToken, form });
  assert.equal(r.status, 400);
});

test('invalid sections are rejected', async () => {
  const form = new FormData();
  form.append('section', 'nope');
  form.append('title', 'Whatever');
  form.append('url', 'https://example.com');
  assert.equal((await call('/files', { method: 'POST', token: adminToken, form })).status, 400);
});

test('admin can update the thought of the day; students can read it', async () => {
  const put = await call('/settings/thought', { method: 'PUT', token: adminToken, json: { text: 'Keep learning.' } });
  assert.equal(put.status, 200);
  assert.equal((await call('/settings/thought', { token: studentToken })).body.text, 'Keep learning.');
});

test('assistant validates input and reports when it is not configured', async () => {
  const bad = await call('/assistant/chat', { method: 'POST', token: studentToken, json: { messages: [] } });
  assert.equal(bad.status, 400);
  const r = await call('/assistant/chat', { method: 'POST', token: studentToken, json: { messages: [{ role: 'user', content: 'Where is the calendar?' }] } });
  assert.equal(r.status, 503);
});

test('attendance: courses, rosters, marking, summaries and reports', async () => {
  // Admin sets up a course and enrols the student; unknown IDs are reported back.
  const course = await call('/courses', { method: 'POST', token: adminToken, json: { code: 'cs 301'.replace(' ', ''), name: 'Database Systems' } });
  assert.equal(course.status, 201);
  const cid = course.body.id;
  const roster = await call(`/courses/${cid}/students`, { method: 'PUT', token: adminToken, json: { enrollments: ['s1001', 'NOPE99'] } });
  assert.deepEqual(roster.body, { enrolled: 1, unknown: ['NOPE99'] });
  const sid = (await call('/students', { token: adminToken })).body.students.find((s) => s.enrollment === 'S1001').id;

  // Students cannot mark attendance; future dates and non-enrolled students are rejected.
  const mark = (token, date, status, extra = {}) =>
    call('/attendance/mark', { method: 'POST', token, json: { course_id: cid, date, period: 1, records: [{ student_id: sid, status }], ...extra } });
  assert.equal((await mark(studentToken, '2026-01-05', 'P')).status, 403);
  assert.equal((await mark(adminToken, '2999-01-01', 'P')).status, 400);
  assert.equal((await call('/attendance/mark', { method: 'POST', token: adminToken, json: { course_id: cid, date: '2026-01-05', period: 1, records: [{ student_id: 999999, status: 'P' }] } })).status, 400);

  // 3 present + 1 absent = exactly 75%: no shortage yet.
  for (const [date, status] of [['2026-01-05', 'P'], ['2026-01-06', 'P'], ['2026-01-07', 'P'], ['2026-01-08', 'A']]) {
    assert.equal((await mark(adminToken, date, status)).status, 200);
  }
  let me = (await call('/attendance/me', { token: studentToken })).body;
  assert.equal(me.courses[0].percent, 75);
  assert.equal(me.courses[0].shortage, false);

  // One more absence drops to 60%: shortage, and 3 straight classes are needed to get back to 75%.
  await mark(adminToken, '2026-01-09', 'A');
  me = (await call('/attendance/me', { token: studentToken })).body;
  assert.equal(me.courses[0].percent, 60);
  assert.equal(me.courses[0].shortage, true);
  assert.equal(me.courses[0].needed, 3);

  // The assistant answers attendance questions from live data (no AI key needed) and flags the shortage.
  const chat = (content) => call('/assistant/chat', { method: 'POST', token: studentToken, json: { messages: [{ role: 'user', content }] } });
  const direct = await chat('Is my attendance okay?');
  assert.equal(direct.status, 200);
  assert.match(direct.body.reply, /below the required 75%/);
  assert.match(direct.body.reply, /next 3 classes/);
  // Mixed question + AI unavailable: still gets the attendance figures instead of an error.
  const mixed = await chat('Is my attendance okay and what is my timetable today?');
  assert.equal(mixed.status, 200);
  assert.match(mixed.body.reply, /60%/);

  // Corrections: re-marking a day updates it instead of duplicating it.
  await mark(adminToken, '2026-01-09', 'P');
  assert.equal((await call('/attendance/me', { token: studentToken })).body.courses[0].total, 5);

  // Date-wise records, admin sessions list and reports.
  const records = await call(`/attendance/me/records?course_id=${cid}`, { token: studentToken });
  assert.equal(records.body.records.length, 5);
  assert.equal((await call(`/attendance/sessions?course_id=${cid}`, { token: adminToken })).body.sessions.length, 5);
  const report = await call(`/attendance/report?course_id=${cid}`, { token: adminToken });
  assert.equal(report.body.sessions, 5);
  assert.equal(report.body.students[0].present, 4);
  const csv = await fetch(`${base}/attendance/report.csv?course_id=${cid}`, { headers: { Authorization: `Bearer ${adminToken}` } });
  assert.match(await csv.text(), /S1001/);

  // Deleting a class record removes it from everyone's totals.
  assert.equal((await call(`/attendance/sessions?course_id=${cid}&date=2026-01-09&period=1`, { method: 'DELETE', token: adminToken })).status, 204);
  assert.equal((await call('/attendance/me', { token: studentToken })).body.courses[0].total, 4);
});

test('timetable: import, class-based view, entries and validation', async () => {
  const importCsv = (csv, mode = 'replace') => call('/timetable/import', { method: 'POST', token: adminToken, json: { class_name: 'dsai-c', mode, csv } });

  // Bad rows reject the whole import and nothing is saved.
  const bad = await importCsv('Funday,3,CS1\nMonday,99,CS301');
  assert.equal(bad.status, 400);
  assert.equal((await call('/timetable?class=DSAI-C', { token: adminToken })).body.entries.length, 0);

  const csv = 'Day,Period,Course code,Group,Teacher,Room\nMonday,3,CS334,Group 1,Azra Iftekhar,B015\nmon,5,CS301,,"Ishaque, Mohammad",B141\nTuesday,1,cg303,,Shaz Alam,B027\n';
  const ok = await importCsv(csv);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.imported, 3);

  // The student's own class (set at registration) is shown by default.
  const mine = await call('/timetable', { token: studentToken });
  assert.equal(mine.body.class_name, 'DSAI-C');
  assert.equal(mine.body.entries.length, 3);
  assert.ok(mine.body.entries.some((e) => e.course_code === 'CG303'));
  assert.ok(mine.body.entries.some((e) => e.teacher === 'Ishaque, Mohammad'));
  assert.equal(mine.body.periods.length, 8);

  // Students cannot change timetables.
  const entry = { class_name: 'DSAI-C', day: 3, period: 2, course_code: 'CS342', group_name: 'Group 1', teacher: 'Mohd Anas Khan', room: 'B038' };
  assert.equal((await call('/timetable', { method: 'POST', token: studentToken, json: entry })).status, 403);

  // Admin can add, edit and delete single entries; invalid periods are rejected.
  assert.equal((await call('/timetable', { method: 'POST', token: adminToken, json: { ...entry, period: 9 } })).status, 400);
  const added = await call('/timetable', { method: 'POST', token: adminToken, json: entry });
  assert.equal(added.status, 201);
  const edited = await call(`/timetable/${added.body.id}`, { method: 'PUT', token: adminToken, json: { day: 3, period: 2, course_code: 'CS342', room: 'B235' } });
  assert.equal(edited.status, 200);
  const after = (await call('/timetable', { token: studentToken })).body.entries.find((e) => e.id === added.body.id);
  assert.equal(after.room, 'B235');
  assert.equal((await call(`/timetable/${added.body.id}`, { method: 'DELETE', token: adminToken })).status, 204);

  // Replace mode swaps the whole timetable; append mode adds to it.
  assert.equal((await importCsv('Friday,1,CS301,,Shakir Ali,B115')).body.imported, 1);
  assert.equal((await call('/timetable', { token: studentToken })).body.entries.length, 1);
  await importCsv('Friday,2,CG303,,Shaz Alam,Online', 'append');
  assert.equal((await call('/timetable', { token: studentToken })).body.entries.length, 2);
});

test('removed students lose access immediately', async () => {
  const students = await call('/students', { token: adminToken });
  const id = students.body.students[0].id;
  assert.equal((await call(`/students/${id}`, { method: 'DELETE', token: adminToken })).status, 204);
  assert.equal((await call('/files', { token: studentToken })).status, 401);
});
