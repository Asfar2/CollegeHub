'use strict';
/* Attendance module: student reports (cumulative + date-wise) and the admin attendance manager.
   Loaded after app.js and uses its globals (S, api, esc, $, flash, render, fetchBlob). */

const todayISO = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in the browser's time zone
const fmtDate = (d) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
const classes = (n) => `${n} class${n === 1 ? '' : 'es'}`;

Object.assign(S, {
  attSummary: null,
  att: { tab: 'cumulative', courseId: null, records: [] },
  mgr: { tab: 'mark', courses: [], courseId: null, date: todayISO(), period: 1, sheet: null, sessions: [], report: null, editId: null, roster: '', rosterMsg: '', msg: '', bad: false },
});

const bar = (c) => `<div class="bar ${c.shortage ? 'bad' : ''}"><span style="width:${Math.min(100, c.percent || 0)}%"></span></div>`;
const pct = (c) => (c.total ? `${c.percent}%` : '—');
const statusText = (c, min) => {
  if (!c.total) return '<span class="mut">No classes yet</span>';
  if (c.shortage) return `<span class="badtxt">${ic('alert', 14)} Shortage — attend the next ${classes(c.needed)} to reach ${min}%</span>`;
  return `<span class="oktxt">${ic('check', 14)} OK</span>${c.can_miss ? `<span class="mut"> — can miss ${classes(c.can_miss)}</span>` : ''}`;
};

/* ================= Student ================= */

function attDashboardCard(items) {
  const d = S.attSummary;
  const files = items.map((f) => `<div class="it"><span class="it-l">${ic('file', 16)}<button class="lnk" data-act="open" data-id="${f.id}">${esc(f.title)}</button></span></div>`).join('');
  let body;
  if (!d || !d.courses.length) {
    body = '<div class="mut">Your attendance will appear here once you are enrolled in a course.</div>';
  } else {
    const o = d.overall;
    const low = d.courses.filter((c) => c.shortage);
    body = `<div class="it"><span><strong class="big ${o.shortage ? 'badtxt' : 'oktxt'}">${pct(o)}</strong> <span class="mut">overall · ${o.present}/${o.total} classes</span></span>
      <span><button data-act="att-open" data-tab="datewise">Date-wise</button> <button class="p" data-act="att-open" data-tab="cumulative">Cumulative report</button></span></div>
      ${low.length ? `<div class="msg err">${ic('alert', 18)}<span>Below ${d.min}% in: ${low.map((c) => esc(c.code)).join(', ')}</span></div>` : ''}`;
  }
  return `<div class="card">${cardHead('calCheck', 'Class Attendance')}${body}${files}</div>`;
}

async function openAttendance(tab) {
  S.attSummary = await api('/attendance/me');
  S.att = { tab, courseId: S.attSummary.courses[0]?.id ?? null, records: [] };
  if (tab === 'datewise') await loadRecords();
  S.view = 'attendance';
  render();
  window.scrollTo(0, 0);
}

async function loadRecords() {
  S.att.records = S.att.courseId ? (await api(`/attendance/me/records?course_id=${S.att.courseId}`)).records : [];
}

function attStudentPage() {
  const d = S.attSummary;
  const head = pageHead('Class Attendance', 'Cumulative report and date-wise records', `<button class="ghost" data-act="att-print">${ic('printer', 16)} Print</button>`);
  if (!d || !d.courses.length) return `${head}<main><div class="card">You are not enrolled in any course yet. Please contact the admin office.</div></main>`;

  const low = d.courses.filter((c) => c.shortage);
  const tabs = [['cumulative', 'Cumulative report'], ['datewise', 'Date-wise']]
    .map(([k, l]) => `<button class="${S.att.tab === k ? 'on' : ''}" data-act="att-tab" data-tab="${k}">${l}</button>`).join('');
  const course = d.courses.find((c) => c.id === S.att.courseId);

  let body;
  if (S.att.tab === 'cumulative') {
    const o = d.overall;
    body = `${low.length ? `<div class="msg err">${ic('alert', 18)}<span>Your attendance is below ${d.min}% in: <strong>${low.map((c) => esc(c.code)).join(', ')}</strong>. Low attendance may affect your exam eligibility.</span></div>` : ''}
      <div class="card"><div class="mut">Overall attendance</div><div class="big ${o.shortage ? 'badtxt' : 'oktxt'}">${pct(o)}</div>${bar(o)}
        <div class="mut">${o.present} present · ${o.absent} absent · ${o.total} classes held · minimum required ${d.min}%</div></div>
      <div class="card scroll"><table class="tbl"><thead><tr><th>Course</th><th>Held</th><th>Present</th><th>Absent</th><th>Attendance</th><th>Status</th></tr></thead><tbody>
      ${d.courses.map((c) => `<tr class="${c.shortage ? 'low' : ''}"><td><strong>${esc(c.code)}</strong><div class="mut">${esc(c.name)}</div></td><td>${c.total}</td><td>${c.present}</td><td>${c.absent}</td><td>${bar(c)}${pct(c)}</td><td>${statusText(c, d.min)}</td></tr>`).join('')}
      </tbody></table></div>`;
  } else {
    const rows = S.att.records.map((r) => `<tr><td>${fmtDate(r.date)}</td><td>${r.period}</td><td><span class="st ${r.status === 'P' ? 'pr' : 'ab'}">${r.status === 'P' ? 'Present' : 'Absent'}</span></td></tr>`).join('');
    body = `<div class="card"><label>Course</label><select id="att-course">${d.courses.map((c) => `<option value="${c.id}" ${c.id === S.att.courseId ? 'selected' : ''}>${esc(c.code)} — ${esc(c.name)}</option>`).join('')}</select>
      ${course ? `<div class="mut">${course.present} present of ${course.total} classes (${pct(course)})</div>` : ''}</div>
      <div class="card scroll">${rows ? `<table class="tbl"><thead><tr><th>Date</th><th>Period</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="mut">No classes have been recorded for this course yet.</div>'}</div>`;
  }
  return `${head}<main><div id="flash"></div>
    <div class="print-only"><h2>Attendance report</h2><div>${esc(S.user.name)} · ${esc(S.user.enrollment)} · generated ${new Date().toLocaleDateString()}${S.att.tab === 'datewise' && course ? ` · ${esc(course.code)}` : ''}</div></div>
    <div class="tabs2">${tabs}</div>${body}</main>`;
}

/* ================= Admin manager ================= */

const mgrSay = (text, bad = false) => { S.mgr.msg = text; S.mgr.bad = bad; render(); };

async function openManager() {
  const m = S.mgr;
  m.courses = (await api('/courses')).courses;
  if (!m.courses.some((c) => c.id === m.courseId)) m.courseId = m.courses[0]?.id ?? null;
  m.sheet = null; m.report = null; m.msg = '';
  await loadSessions();
  S.view = 'attmgr';
  render();
  window.scrollTo(0, 0);
}

async function loadSessions() {
  const m = S.mgr;
  m.sessions = m.courseId ? (await api(`/attendance/sessions?course_id=${m.courseId}`)).sessions : [];
}

async function loadSheet() {
  const m = S.mgr;
  if (!m.courseId) return;
  const q = new URLSearchParams({ course_id: m.courseId, date: m.date, period: m.period });
  const sheet = await api(`/attendance/sheet?${q}`);
  if (!sheet.marked) sheet.students.forEach((s) => { s.status = 'P'; }); // new class: everyone starts Present
  m.sheet = sheet;
  m.msg = '';
  render();
}

async function saveSheet() {
  const sh = S.mgr.sheet;
  if (!sh.students.length) return mgrSay('No students are enrolled in this course yet.', true);
  if (sh.students.some((s) => !s.status)) return mgrSay('Please mark every student as Present or Absent.', true);
  const res = await api('/attendance/mark', {
    method: 'POST',
    body: { course_id: sh.course.id, date: sh.date, period: sh.period, records: sh.students.map((s) => ({ student_id: s.id, status: s.status })) },
  });
  sh.marked = true;
  await loadSessions();
  mgrSay(`Saved: ${res.present} present, ${res.absent} absent.`);
}

async function loadReport() {
  const m = S.mgr;
  m.report = m.courseId ? await api(`/attendance/report?course_id=${m.courseId}`) : null;
}

const courseOptions = () => S.mgr.courses.map((c) => `<option value="${c.id}" ${c.id === S.mgr.courseId ? 'selected' : ''}>${esc(c.code)} — ${esc(c.name)}</option>`).join('');

function attManagerPage() {
  const m = S.mgr;
  const tabs = [['mark', 'Mark attendance'], ['reports', 'Reports'], ['courses', 'Courses & students']]
    .map(([k, l]) => `<button class="${m.tab === k ? 'on' : ''}" data-act="mg-tab" data-tab="${k}">${l}</button>`).join('');
  const panel = m.tab === 'mark' ? mgrMark() : m.tab === 'reports' ? mgrReports() : mgrCourses();
  return `${pageHead('Attendance manager', 'Mark classes, review reports and manage courses')}
    <main>${m.msg ? `<div class="msg ${m.bad ? 'err' : ''}">${esc(m.msg)}</div>` : ''}<div class="tabs2">${tabs}</div>${panel}</main>`;
}

function mgrMark() {
  const m = S.mgr, sh = m.sheet;
  if (!m.courses.length) return '<div class="card">Add a course first, in the “Courses &amp; students” tab.</div>';
  const periods = Array.from({ length: 8 }, (_, i) => `<option value="${i + 1}" ${m.period === i + 1 ? 'selected' : ''}>Period ${i + 1}</option>`).join('');
  const present = sh ? sh.students.filter((s) => s.status === 'P').length : 0;
  const absent = sh ? sh.students.filter((s) => s.status === 'A').length : 0;
  const sheetCard = !sh ? '' : `<div class="card"><h3>${esc(sh.course.code)} · ${fmtDate(sh.date)} · Period ${sh.period}${sh.marked ? '<span class="tag">Already marked — editing</span>' : ''}</h3>
    ${sh.students.length ? `<div class="it"><span class="mut">${present} present · ${absent} absent · ${sh.students.length} students</span>
      <span><button data-act="mg-all" data-s="P">All present</button> <button data-act="mg-all" data-s="A">All absent</button></span></div>
      ${sh.students.map((s) => `<div class="it"><span>${esc(s.name)} <span class="mut">· ${esc(s.enrollment)}</span></span>
        <span class="seg"><button class="${s.status === 'P' ? 'on pr' : ''}" data-act="mg-set" data-id="${s.id}" data-s="P">Present</button><button class="${s.status === 'A' ? 'on ab' : ''}" data-act="mg-set" data-id="${s.id}" data-s="A">Absent</button></span></div>`).join('')}
      <div style="margin-top:14px"><button class="p" data-act="mg-save">Save attendance</button></div>`
      : '<div class="mut">No students are enrolled in this course yet. Add them in “Courses &amp; students”.</div>'}</div>`;
  const sessions = m.sessions.length ? `<div class="card"><h3>Recorded classes</h3>${m.sessions.map((s) => `<div class="it"><span>${fmtDate(s.date)} · Period ${s.period} <span class="mut">· ${s.present}/${s.total} present</span></span>
      <span><button data-act="mg-edit-session" data-date="${s.date}" data-period="${s.period}">Edit</button> <button class="d" data-act="mg-del-session" data-date="${s.date}" data-period="${s.period}">Delete</button></span></div>`).join('')}</div>` : '';
  return `<div class="card"><h3>Select class</h3>
    <div class="pair"><div><label>Course</label><select id="mg-course">${courseOptions()}</select></div><div><label>Date</label><input type="date" id="mg-date" value="${m.date}" max="${todayISO()}"></div></div>
    <div class="pair"><div><label>Period / session</label><select id="mg-period">${periods}</select></div><div style="align-self:end"><button class="p" data-act="mg-load" style="margin-bottom:12px">Load class list</button></div></div></div>${sheetCard}${sessions}`;
}

function mgrReports() {
  const m = S.mgr, r = m.report;
  if (!m.courses.length) return '<div class="card">Add a course first.</div>';
  const low = r ? r.students.filter((s) => s.shortage).length : 0;
  const table = !r ? '' : `<div class="card scroll"><div class="it"><span class="mut">${classes(r.sessions)} held · minimum ${r.min}% · <strong class="${low ? 'badtxt' : ''}">${low} below minimum</strong></span>
      <span class="noprint"><button data-act="mg-csv">Export CSV</button> <button data-act="mg-print">Print</button></span></div>
    ${r.students.length ? `<table class="tbl"><thead><tr><th>Enrollment</th><th>Name</th><th>Held</th><th>Present</th><th>Attendance</th><th>Status</th></tr></thead><tbody>
      ${r.students.map((s) => `<tr class="${s.shortage ? 'low' : ''}"><td>${esc(s.enrollment)}</td><td>${esc(s.name)}</td><td>${s.total}</td><td>${s.present}</td><td>${bar(s)}${pct(s)}</td><td>${statusText(s, r.min)}</td></tr>`).join('')}</tbody></table>` : '<div class="mut">No students are enrolled in this course.</div>'}</div>`;
  return `<div class="card noprint"><label>Course</label><select id="mg-course">${courseOptions()}</select><button class="p" data-act="mg-report">Show report</button></div>
    ${r ? `<div class="print-only"><h2>Attendance report — ${esc(r.course.code)} ${esc(r.course.name)}</h2></div>` : ''}${table}`;
}

function mgrCourses() {
  const m = S.mgr;
  const editor = m.editId ? `<div class="card"><h3>Students in ${esc((m.courses.find((c) => c.id === m.editId) || {}).code || '')}</h3>
      <label>Enrollment numbers (one per line, or separated by commas)</label>
      <textarea id="mg-roster" rows="8">${esc(m.roster)}</textarea>
      ${m.rosterMsg ? `<div class="msg">${esc(m.rosterMsg)}</div>` : ''}
      <button class="p" data-act="mg-save-roster">Save students</button> <button data-act="mg-close-roster">Close</button></div>` : '';
  return `<div class="card"><h3>Add a course</h3><form id="course-form"><div class="pair">
      <div><label>Course code</label><input name="code" required minlength="2" maxlength="20" placeholder="CS301"></div>
      <div><label>Course name</label><input name="name" required minlength="2" maxlength="120" placeholder="Database Systems"></div></div>
      <button class="p">Save course</button></form></div>
    <div class="card"><h3>Courses</h3>${m.courses.length ? m.courses.map((c) => `<div class="it"><span><strong>${esc(c.code)}</strong> — ${esc(c.name)} <span class="mut">· ${c.student_count} student${c.student_count === 1 ? '' : 's'}</span></span>
      <span><button data-act="mg-edit-roster" data-id="${c.id}">Students</button> <button class="d" data-act="mg-del-course" data-id="${c.id}">Delete</button></span></div>`).join('') : '<div class="mut">No courses yet.</div>'}</div>${editor}`;
}

/* ================= Events ================= */

document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-act^="att-"],[data-act^="mg-"]');
  if (!t) return;
  const m = S.mgr;
  const id = Number(t.dataset.id);
  try {
    switch (t.dataset.act) {
      case 'att-open': await openAttendance(t.dataset.tab); break;
      case 'att-tab':
        S.att.tab = t.dataset.tab;
        if (S.att.tab === 'datewise') await loadRecords();
        render();
        break;
      case 'att-print': window.print(); break;

      case 'mg-tab':
        m.tab = t.dataset.tab; m.msg = '';
        if (m.tab === 'reports') await loadReport();
        render();
        break;
      case 'mg-load': await loadSheet(); break;
      case 'mg-set': m.sheet.students.find((s) => s.id === id).status = t.dataset.s; render(); break;
      case 'mg-all': m.sheet.students.forEach((s) => { s.status = t.dataset.s; }); render(); break;
      case 'mg-save': await saveSheet(); break;
      case 'mg-edit-session': m.date = t.dataset.date; m.period = Number(t.dataset.period); await loadSheet(); break;
      case 'mg-del-session': {
        if (!confirm('Delete this class record? Everyone’s attendance for it will be removed.')) break;
        await api(`/attendance/sessions?${new URLSearchParams({ course_id: m.courseId, date: t.dataset.date, period: t.dataset.period })}`, { method: 'DELETE' });
        m.sheet = null;
        await loadSessions();
        mgrSay('Class record deleted.');
        break;
      }
      case 'mg-report': await loadReport(); render(); break;
      case 'mg-csv': {
        const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(await fetchBlob(`/attendance/report.csv?course_id=${m.courseId}`)), download: `attendance-${m.report?.course.code || 'report'}.csv` });
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
        break;
      }
      case 'mg-print': window.print(); break;

      case 'mg-edit-roster': {
        const res = await api(`/courses/${id}/students`);
        m.editId = id; m.roster = res.students.map((s) => s.enrollment).join('\n'); m.rosterMsg = '';
        render();
        break;
      }
      case 'mg-save-roster': {
        const list = m.roster.split(/[\s,;]+/).filter(Boolean);
        const res = await api(`/courses/${m.editId}/students`, { method: 'PUT', body: { enrollments: list } });
        m.courses = (await api('/courses')).courses;
        m.rosterMsg = `${res.enrolled} student${res.enrolled === 1 ? '' : 's'} saved.${res.unknown.length ? ` Not found (check spelling): ${res.unknown.join(', ')}` : ''}`;
        render();
        break;
      }
      case 'mg-close-roster': m.editId = null; render(); break;
      case 'mg-del-course':
        if (!confirm('Delete this course and ALL its attendance records?')) break;
        await api(`/courses/${id}`, { method: 'DELETE' });
        m.courses = (await api('/courses')).courses;
        if (m.courseId === id) m.courseId = m.courses[0]?.id ?? null;
        m.editId = null; m.sheet = null; m.report = null;
        await loadSessions();
        mgrSay('Course deleted.');
        break;
    }
  } catch (err) {
    if (err.message === 'Session expired') return;
    if (S.view === 'attmgr') mgrSay(err.message, true); else flash(err.message, true);
  }
});

document.addEventListener('change', async (e) => {
  const m = S.mgr;
  try {
    if (e.target.id === 'att-course') { S.att.courseId = Number(e.target.value); await loadRecords(); render(); }
    else if (e.target.id === 'mg-course') {
      m.courseId = Number(e.target.value); m.sheet = null; m.report = null; m.msg = '';
      await loadSessions();
      if (m.tab === 'reports') await loadReport();
      render();
    } else if (e.target.id === 'mg-date') { m.date = e.target.value; m.sheet = null; render(); }
    else if (e.target.id === 'mg-period') { m.period = Number(e.target.value); m.sheet = null; render(); }
  } catch (err) { if (err.message !== 'Session expired') mgrSay(err.message, true); }
});

document.addEventListener('input', (e) => { if (e.target.id === 'mg-roster') S.mgr.roster = e.target.value; });

document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'course-form') return;
  const m = S.mgr;
  try {
    await api('/courses', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
    m.courses = (await api('/courses')).courses;
    if (!m.courseId) m.courseId = m.courses[0]?.id ?? null;
    mgrSay('Course saved.');
  } catch (err) { if (err.message !== 'Session expired') mgrSay(err.message, true); }
});

// Short summary for the dashboard tile.
function attTileText() {
  const d = S.attSummary;
  if (!d || !d.courses.length) return 'Not enrolled in a course yet';
  const o = d.overall;
  return o.total ? `${o.percent}% overall${o.shortage ? ' · below minimum' : ''}` : 'No classes recorded yet';
}
