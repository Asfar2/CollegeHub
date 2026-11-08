'use strict';
/* collegeHub frontend. Talks to the REST API under /api; no framework or build step. */

const API = '/api';
const BRAND = 'collegeHub';
const LIB_SECTIONS = ['notes', 'qp', 'lib']; // sections shown on the Library page
const VIEWABLE = ['application/pdf', 'image/png', 'image/jpeg', 'text/plain']; // opened inside the site
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Logo lockup: white word + black word on an orange box. Pass 'xl' for the stacked landing version.
const hub = (cls = '') => `<span class="hub ${cls}" aria-hidden="true"><span class="hub-a">college</span><b class="hub-b"><span>Hub</span></b></span>`;
const compact = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/* ---------- Icons (inline SVG, 24px grid) ---------- */
const ICON = {
  cap: '<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  calCheck: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
  megaphone: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/>',
  notebook: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M2 6h4M2 10h4M2 14h4M2 18h4M10 8h6M10 12h6"/>',
  sparkles: '<path d="M9.9 4.2 11 7.9l3.7 1.1-3.7 1.1-1.1 3.7-1.1-3.7L5.1 9l3.7-1.1z"/><path d="m18 14 .7 2.3L21 17l-2.3.7L18 20l-.7-2.3L15 17l2.3-.7z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  eye: '<path d="M2 12s4-8 10-8 10 8 10 8-4 8-10 8-10-8-10-8z"/><circle cx="12" cy="12" r="3"/>',
  arrowRight: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  arrowLeft: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  ext: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  alert: '<path d="m10.3 3.9-8.5 14.7A2 2 0 0 0 3.5 21h17a2 2 0 0 0 1.7-2.4L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
};
const ic = (name, size = 20) =>
  `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name] || ''}</svg>`;
const SEC_ICON = { news: 'bell', cal: 'calendar', prereg: 'clipboard', tt: 'clock', att: 'calCheck', fee: 'card', exam: 'monitor', fb: 'message', qp: 'file', notes: 'notebook', lib: 'book', ccgd: 'megaphone', sch: 'cap', doc: 'folder' };
const cardHead = (icon, title) => `<div class="card-h"><span class="ico">${ic(icon, 18)}</span><h3>${esc(title)}</h3></div>`;

const store = {
  get token() { try { return sessionStorage.getItem('portal_token'); } catch { return null; } },
  set token(v) { try { v ? sessionStorage.setItem('portal_token', v) : sessionStorage.removeItem('portal_token'); } catch { /* storage unavailable */ } },
};

const S = {
  view: 'welcome', shown: null, mode: 'student', backTo: 'student', user: null, sections: [], files: [], students: [], thought: '',
  err: '', chat: [], aiOpen: false, aiBusy: false, aiPop: false, replaceId: null, lib: { q: '', type: 'all' }, viewer: null,
};

/* ---------- API helpers ---------- */
async function api(path, { method = 'GET', body, form } = {}) {
  const headers = {};
  if (store.token) headers.Authorization = `Bearer ${store.token}`;
  let payload;
  if (form) payload = form;
  else if (body) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }

  const res = await fetch(API + path, { method, headers, body: payload });
  if (res.status === 204) return null;
  const data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : null;
  if (res.status === 401 && store.token && !path.startsWith('/auth/login')) {
    logout('Your session expired. Please log in again.');
    throw new Error('Session expired');
  }
  if (!res.ok) {
    const detail = data?.details?.map((d) => d.message).filter(Boolean).join(', ');
    throw new Error([data?.error || 'Request failed', detail].filter(Boolean).join(': '));
  }
  return data;
}

async function fetchBlob(path) {
  const res = await fetch(API + path, { headers: { Authorization: `Bearer ${store.token}` } });
  if (res.status === 401) { logout('Your session expired. Please log in again.'); throw new Error('Session expired'); }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not open this file');
  return res.blob();
}

/* ---------- Session ---------- */
function revokeViewer() {
  if (S.viewer) URL.revokeObjectURL(S.viewer.url);
  S.viewer = null;
}

function logout(message = '') {
  store.token = null;
  revokeViewer();
  Object.assign(S, { user: null, view: 'welcome', files: [], students: [], chat: [], aiOpen: false, attSummary: null, ttData: null, err: message });
  render();
}

async function loadData() {
  const jobs = [api('/files'), api('/settings/thought')];
  if (!S.sections.length) jobs.push(api('/settings/sections'));
  if (S.user.role === 'admin') jobs.push(api('/students'));
  const [files, thought, ...rest] = await Promise.all(jobs);
  S.files = files.files;
  S.thought = thought.text;
  if (!S.sections.length) S.sections = rest.shift();
  if (S.user.role === 'admin') S.students = rest.shift().students;
  if (S.user.role === 'student') {
    S.attSummary = await api('/attendance/me').catch(() => null);
    S.ttData = await api('/timetable').catch(() => null);
  }
}

async function boot() {
  if (store.token) {
    try {
      S.user = (await api('/auth/me')).user;
      await loadData();
      S.view = S.user.role;
    } catch { store.token = null; S.user = null; }
  }
  render();
}

/* ---------- Shared layout ---------- */
const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

function navbar() {
  const u = S.user;
  return `<header class="nav"><div class="nav-in">
    <a class="brand" data-act="back" role="button" tabindex="0" aria-label="${BRAND}, back to dashboard">${hub()}</a>
    <div class="nav-r"><div class="who"><div class="av">${esc((u.name[0] || '?').toUpperCase())}</div>
      <div class="who-t"><strong>${esc(u.name)}</strong><span>${u.role === 'admin' ? 'Administrator' : esc(u.enrollment)}</span></div></div>
      <button class="ghost icon" data-act="logout" aria-label="Log out" title="Log out">${ic('logout', 19)}</button></div></div></header>`;
}

function pageHead(title, sub = '', actions = '') {
  return `${navbar()}<div class="wrap pagehead"><button class="ghost back" data-act="back">${ic('arrowLeft', 17)}<span>Dashboard</span></button>
    <div class="ph-main"><h1>${esc(title)}</h1>${sub ? `<p>${esc(sub)}</p>` : ''}</div><div class="ph-actions">${actions}</div></div>`;
}

const tile = (icon, title, sub, act, extra = '') =>
  `<button class="tile" data-act="${act}" ${extra}><span class="ti">${ic(icon, 22)}</span><span class="tt">${esc(title)}</span><span class="ts">${esc(sub)}</span><span class="ta">${ic('arrowRight', 17)}</span></button>`;

/* ---------- Views ---------- */
function landingView() {
  return `<div class="landing"><div class="orb o1"></div><div class="orb o2"></div><div class="orb o3"></div>
    <div class="land-in">
      <div class="land-hero">
        <div><span class="pill"><i></i>Student information system</span></div>
        <h1 class="land-h1" aria-label="${BRAND}">${hub('xl')}</h1>
        <p>Your timetable, attendance, notes and notices in one place, with an AI assistant to help you find anything.</p>
        ${S.err ? `<div class="land-msg">${esc(S.err)}</div>` : ''}
        <div class="roles">
          <button class="role" data-act="goto-login" data-mode="student"><span class="ri">${ic('users', 22)}</span><span><strong>Student</strong><small>Timetable, attendance and notes</small></span><span class="go">${ic('arrowRight', 18)}</span></button>
          <button class="role" data-act="goto-login" data-mode="admin"><span class="ri">${ic('shield', 22)}</span><span><strong>Admin</strong><small>Manage content and records</small></span><span class="go">${ic('arrowRight', 18)}</span></button>
        </div>
        <div class="feat"><span>${ic('clock', 15)} Live timetable</span><span>${ic('calCheck', 15)} Attendance reports</span><span>${ic('sparkles', 15)} AI assistant</span></div>
      </div>
      <div class="land-foot">© ${new Date().getFullYear()} ${BRAND}</div></div></div>`;
}

function loginView() {
  const admin = S.mode === 'admin';
  return `<div class="landing"><div class="orb o1"></div><div class="orb o2"></div><div class="orb o3"></div>
    <div class="land-in"><a class="brand" data-act="home" role="button" tabindex="0" aria-label="${BRAND}, back to start">${hub()}</a>
      <form class="gcard" id="login-form"><div class="g-ico">${ic(admin ? 'shield' : 'users', 24)}</div>
        <h2>${admin ? 'Admin sign in' : 'Student sign in'}</h2>
        <p>${admin ? 'Enter your administrator credentials.' : 'Use the enrollment number and password given by your college.'}</p>
        ${S.err ? `<div class="msg err">${ic('alert', 18)}<span>${esc(S.err)}</span></div>` : ''}
        <label for="enr">${admin ? 'Admin ID' : 'Enrollment number'}</label><input id="enr" autocomplete="username" required>
        <label for="pw">Password</label><input id="pw" type="password" autocomplete="current-password" required>
        <button class="p" style="width:100%" id="login-btn">Sign in ${ic('arrowRight', 17)}</button>
        <button type="button" class="ghost backlink" data-act="home">${ic('arrowLeft', 16)} Back</button></form></div></div>`;
}

function studentView() {
  const u = S.user;
  const lib = S.files.filter((f) => LIB_SECTIONS.includes(f.section)).length;
  const date = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return `${navbar()}<main>
    <section class="hero"><div><span class="eyebrow">${greet()}</span><h1>${esc(u.name.split(' ')[0])}</h1>
        <p>${esc(u.enrollment)}${u.program ? ` · ${esc(u.program)}` : ''}</p><div class="date">${date}</div></div>
      <aside class="quote"><span class="q-label">${ic('sparkles', 14)} Thought of the day</span><p>${esc(S.thought)}</p></aside></section>
    <div class="tiles">
      ${tile('book', 'Library', `${lib} document${lib === 1 ? '' : 's'}`, 'lib')}
      ${tile('clock', 'Timetable', ttTileText(), 'tt-open', 'data-tab="today"')}
      ${tile('calCheck', 'Attendance', attTileText(), 'att-open', 'data-tab="cumulative"')}
      ${tile('sparkles', 'Ask the assistant', 'Timetable, notes, attendance', 'ai-toggle')}
    </div>
    <div id="flash"></div>
    <div class="sec-title">All services</div><div class="sgrid">${sectionCards(false)}</div>
    <div class="foot">© ${new Date().getFullYear()} ${BRAND}</div></main>`;
}

function adminView() {
  return `${navbar()}<main>
    <section class="hero" style="grid-template-columns:1fr"><div><span class="eyebrow">Admin console</span><h1>Manage ${BRAND}</h1>
      <p>Publish content, register students, mark attendance and maintain timetables.</p></div></section>
    <div class="tiles">
      ${tile('calCheck', 'Attendance manager', 'Mark classes and view reports', 'att-manager')}
      ${tile('clock', 'Timetable manager', 'Enter or import class timetables', 'tt-manager')}
      ${tile('book', 'Library', 'Browse notes and papers', 'lib')}
      ${tile('sparkles', 'Assistant', 'Ask how anything works', 'ai-toggle')}
    </div>
    <div id="flash"></div>
    <div class="agrid">
      <div class="card">${cardHead('upload', 'Add content')}<form id="upload-form">
        <label>Section</label><select name="section">${S.sections.map((s) => `<option value="${s.key}">${esc(s.label)}</option>`).join('')}</select>
        <label>Title</label><input name="title" required minlength="2" placeholder="e.g. DBMS Unit 1 Notes">
        <div class="pair"><div><label>Course code (Library search)</label><input name="course_code" maxlength="20" placeholder="CS301"></div>
          <div><label>Course name (optional)</label><input name="course_name" maxlength="120" placeholder="Database Systems"></div></div>
        <label>Upload a file (PDF, Office, image, txt, csv)</label><input type="file" name="file">
        <label>…or paste a link instead</label><input name="url" type="url" placeholder="https://">
        <button class="p">${ic('upload', 16)} Publish</button></form></div>
      <div class="card">${cardHead('users', 'Register students')}<form id="student-form">
        <label>Enrollment number</label><input name="enrollment" required minlength="3">
        <label>Full name</label><input name="name" required minlength="2">
        <label>Class / program (e.g. DSAI-C) — decides which timetable they see</label><input name="program" maxlength="30" placeholder="DSAI-C">
        <label>Password (min 8 characters; re-adding an enrollment resets it)</label><input name="password" type="password" required minlength="8" autocomplete="new-password">
        <button class="p">Save student</button></form>
        <div style="margin-top:14px">${S.students.length ? S.students.map((s) => `<div class="it"><span class="it-l"><strong>${esc(s.name)}</strong><span class="mut">${esc(s.enrollment)}</span>${s.program ? `<span class="tag">${esc(s.program)}</span>` : ''}</span><button class="d" data-act="del-student" data-id="${s.id}">${ic('x', 15)} Remove</button></div>`).join('') : '<div class="mut">No students registered yet.</div>'}</div></div>
      <div class="card">${cardHead('sparkles', 'Thought of the Day')}<form id="thought-form"><textarea name="text" rows="3" maxlength="300">${esc(S.thought)}</textarea><button class="p">Save</button></form></div>
    </div>
    <div class="sec-title">Published content</div><div class="sgrid">${sectionCards(true)}</div><input type="file" id="replace-input" hidden></main>`;
}

function libraryView() {
  const types = [['all', 'All documents'], ['notes', 'Lecture Notes'], ['qp', 'Question Papers'], ['lib', 'Library']];
  const codes = [...new Set(libBase().map((f) => f.course_code).filter(Boolean))].sort();
  return `${pageHead('Library', 'Lecture notes, question papers and study material')}<main><div id="flash"></div>
    <div class="searchbar"><div class="sf"><span class="si">${ic('search', 18)}</span><input id="lib-q" placeholder="Search by course code, subject or title (e.g. CS301)" value="${esc(S.lib.q)}" autocomplete="off"></div>
      <select id="lib-type">${types.map(([v, l]) => `<option value="${v}" ${S.lib.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    ${codes.length ? `<div class="chips">${codes.map((c) => `<button class="chip" data-act="chip" data-code="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : ''}
    <div id="lib-results">${libResults()}</div></main>`;
}

function viewerView() {
  return `<div class="vbar"><button class="ghost" data-act="close-viewer">${ic('arrowLeft', 17)} Back</button><strong class="vt">${esc(S.viewer.file.title)}</strong>
    <span class="va"><button class="ghost" data-act="viewer-newtab">${ic('ext', 16)} Full screen</button><button class="p" data-act="viewer-download">${ic('download', 16)} Download</button></span></div>
    <iframe class="viewer" src="${S.viewer.url}" title="${esc(S.viewer.file.title)}"></iframe>`;
}

function render() {
  const app = $('#app');
  const changed = S.view !== S.shown; // only animate when the page changes, not on every update
  S.shown = S.view;
  app.classList.toggle('enter', changed);
  document.body.className = ['welcome', 'login'].includes(S.view) ? 'w' : '';
  const views = {
    welcome: landingView, login: loginView, student: studentView, admin: adminView, library: libraryView,
    viewer: () => (S.viewer ? viewerView() : ''),
    attendance: () => attStudentPage(), attmgr: () => attManagerPage(),
    timetable: () => ttStudentPage(), ttmgr: () => ttManagerPage(),
  };
  app.innerHTML = (views[S.view] || landingView)();
  renderAssistant();
  if (changed) { // sweep the curtain away to reveal the new page
    const c = $('#curtain');
    if (c) { c.classList.remove('go'); void c.offsetWidth; c.classList.add('go'); }
  }
}

function sectionCards(admin) {
  const week = 7 * 24 * 3600 * 1000;
  return S.sections.map((sec) => {
    const items = S.files.filter((f) => f.section === sec.key);
    if (!admin && sec.key === 'att') return attDashboardCard(items);
    if (!admin && sec.key === 'tt') return ttDashboardCard(items);
    if (!admin && LIB_SECTIONS.includes(sec.key)) {
      return `<div class="card">${cardHead(SEC_ICON[sec.key], sec.label)}<div class="it"><span class="mut">${items.length} document${items.length === 1 ? '' : 's'}</span>
        <button class="p" data-act="lib" data-type="${sec.key}">Open Library ${ic('arrowRight', 16)}</button></div></div>`;
    }
    const rows = items.length ? items.map((f) => {
      const isNew = Date.now() - new Date(f.updated_at.replace(' ', 'T') + 'Z') < week;
      return `<div class="it"><span class="it-l">${ic('file', 16)}<button class="lnk" data-act="open" data-id="${f.id}">${esc(f.title)}</button>
        ${f.course_code ? `<span class="tag">${esc(f.course_code)}</span>` : ''}${isNew ? '<span class="new">NEW</span>' : ''}
        ${admin && f.kind === 'file' && !f.indexed ? `<span class="warn">${ic('alert', 13)} assistant cannot read this</span>` : ''}</span>
        ${admin ? `<span>${f.kind === 'file' ? `<button class="ghost" data-act="replace" data-id="${f.id}">Replace</button> ` : ''}<button class="d" data-act="del-file" data-id="${f.id}">${ic('x', 15)} Delete</button></span>` : ''}</div>`;
    }).join('') : `<div class="mut">${admin ? 'Nothing here yet.' : 'Nothing published yet.'}</div>`;
    return `<div class="card">${cardHead(SEC_ICON[sec.key] || 'file', sec.label)}${rows}</div>`;
  }).join('');
}

/* ---------- Library ---------- */
const libBase = () => S.files.filter((f) => LIB_SECTIONS.includes(f.section));
const sectionLabel = (key) => (S.sections.find((s) => s.key === key) || {}).label || '';

function libItems() {
  const terms = S.lib.q.toLowerCase().split(/\s+/).filter(Boolean);
  return libBase().filter((f) => {
    if (S.lib.type !== 'all' && f.section !== S.lib.type) return false;
    const hay = [f.title, f.course_code, f.course_name, f.original_name].join(' ').toLowerCase();
    const hc = compact(hay);
    return terms.every((t) => hay.includes(t) || hc.includes(compact(t)));
  });
}

function libRow(f) {
  const actions = f.kind === 'link'
    ? `<button data-act="open" data-id="${f.id}">${ic('ext', 15)} Open link</button>`
    : `${VIEWABLE.includes(f.mime) ? `<button class="p" data-act="open" data-id="${f.id}">${ic('eye', 15)} View</button> ` : ''}<button data-act="download" data-id="${f.id}">${ic('download', 15)} Download</button>`;
  return `<div class="it"><span class="it-l">${ic('file', 16)}<span>${esc(f.title)}</span><span class="tag">${esc(sectionLabel(f.section))}</span></span><span>${actions}</span></div>`;
}

function libResults() {
  const items = libItems();
  if (!items.length) return `<div class="card mut" style="text-align:center;padding:36px">${ic('search', 28)}<div style="margin-top:8px">No documents match your search.</div></div>`;
  const groups = new Map();
  for (const f of items) {
    const key = f.course_code || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  const keys = [...groups.keys()].sort((a, b) => (!a ? 1 : !b ? -1 : a.localeCompare(b)));
  return keys.map((k) => {
    const list = groups.get(k);
    const name = list.find((f) => f.course_name)?.course_name;
    return `<div class="card"><div class="card-h"><span class="ico">${ic('book', 18)}</span><h3>${k ? esc(k) : 'General'}${name ? ` <span class="mut" style="font-weight:500">— ${esc(name)}</span>` : ''}</h3></div>${list.map(libRow).join('')}</div>`;
  }).join('');
}

const refreshLib = () => { const r = $('#lib-results'); if (r) r.innerHTML = libResults(); };

function flash(text, bad = false) {
  const el = $('#flash');
  if (el) el.innerHTML = text ? `<div class="msg ${bad ? 'err' : ''}">${ic(bad ? 'alert' : 'check', 18)}<span>${esc(text)}</span></div>` : '';
}

/* ---------- Opening files ---------- */
async function downloadFile(f) {
  try {
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(await fetchBlob(`/files/${f.id}/download`)), download: f.original_name || f.title });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  } catch (e) { if (e.message !== 'Session expired') flash(e.message, true); }
}

async function openItem(id) {
  const f = S.files.find((x) => x.id === id);
  if (!f) return;
  if (f.kind === 'link') return void window.open(f.url, '_blank', 'noopener');
  if (!VIEWABLE.includes(f.mime)) return downloadFile(f); // Word/Excel/PowerPoint can't be shown in a browser
  flash('Opening…');
  try {
    const blob = await fetchBlob(`/files/${f.id}/view`);
    revokeViewer();
    S.viewer = { file: f, url: URL.createObjectURL(blob) };
    S.backTo = S.view;
    S.view = 'viewer';
    render();
    window.scrollTo(0, 0);
  } catch (e) { if (e.message !== 'Session expired') flash(e.message, true); }
}

function closeViewer() {
  revokeViewer();
  S.view = S.backTo || S.user.role;
  render();
}

/* ---------- Actions ---------- */
async function refresh(message) {
  await loadData();
  render();
  if (message) flash(message);
}

async function guarded(fn, success) {
  try {
    const result = await fn();
    await refresh(typeof success === 'function' ? success(result) : success);
  } catch (e) { if (e.message !== 'Session expired') flash(e.message, true); }
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  const id = Number(t.dataset.id);
  switch (t.dataset.act) {
    case 'goto-login': Object.assign(S, { view: 'login', mode: t.dataset.mode, err: '' }); render(); break;
    case 'home': Object.assign(S, { view: 'welcome', err: '' }); render(); break;
    case 'logout': logout(); break;
    case 'open': openItem(id); break;
    case 'download': downloadFile(S.files.find((f) => f.id === id)); break;
    case 'lib': S.lib = { q: '', type: t.dataset.type || 'all' }; S.backTo = S.user.role; S.view = 'library'; render(); window.scrollTo(0, 0); break;
    case 'back': S.view = S.user.role; render(); window.scrollTo(0, 0); break;
    case 'att-manager': openManager().catch((err) => flash(err.message, true)); break;
    case 'chip': S.lib.q = t.dataset.code; $('#lib-q').value = S.lib.q; refreshLib(); break;
    case 'close-viewer': closeViewer(); break;
    case 'viewer-newtab': window.open(S.viewer.url, '_blank'); break;
    case 'viewer-download': downloadFile(S.viewer.file); break;
    case 'del-file': if (confirm('Delete this item?')) guarded(() => api(`/files/${id}`, { method: 'DELETE' }), 'Item deleted.'); break;
    case 'del-student': if (confirm('Remove this student? They will lose access immediately.')) guarded(() => api(`/students/${id}`, { method: 'DELETE' }), 'Student removed.'); break;
    case 'replace': S.replaceId = id; $('#replace-input').click(); break;
    case 'ai-toggle': S.aiOpen = !S.aiOpen; S.aiPop = S.aiOpen; renderAssistant(); if (S.aiOpen) $('#aiq')?.focus(); break;
    case 'ai-send': sendChat(); break;
    case 'ai-suggest': $('#aiq').value = t.dataset.q; sendChat(); break;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'aiq') sendChat();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.classList?.contains('brand')) { e.preventDefault(); e.target.click(); }
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'lib-q') { S.lib.q = e.target.value; refreshLib(); }
});

document.addEventListener('change', (e) => {
  if (e.target.id === 'lib-type') { S.lib.type = e.target.value; refreshLib(); return; }
  if (e.target.id !== 'replace-input' || !e.target.files[0]) return;
  const form = new FormData();
  form.append('file', e.target.files[0]);
  const id = S.replaceId;
  e.target.value = '';
  guarded(() => api(`/files/${id}`, { method: 'PUT', form }), (r) => (r.indexed ? 'File replaced.' : 'File replaced, but the assistant cannot read its text (scanned image or unsupported format).'));
});

document.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const data = Object.fromEntries(new FormData(f));

  if (f.id === 'login-form') {
    const btn = $('#login-btn');
    btn.disabled = true;
    try {
      const res = await api('/auth/login', { method: 'POST', body: { enrollment: $('#enr').value, password: $('#pw').value } });
      if (S.mode === 'admin' && res.user.role !== 'admin') throw new Error('This account does not have admin access.');
      if (S.mode === 'student' && res.user.role === 'admin') throw new Error('Admins should use the Admin login.');
      store.token = res.token;
      S.user = res.user;
      S.err = '';
      await loadData();
      S.view = S.user.role;
      render();
    } catch (err) { S.err = err.message; render(); }
  } else if (f.id === 'upload-form') {
    const form = new FormData();
    form.append('section', data.section);
    form.append('title', data.title);
    if (data.course_code) form.append('course_code', data.course_code);
    if (data.course_name) form.append('course_name', data.course_name);
    if (data.file && data.file.size) form.append('file', data.file);
    else if (data.url) form.append('url', data.url);
    guarded(() => api('/files', { method: 'POST', form }), (r) =>
      r.kind === 'file' && !r.indexed
        ? 'Published. But no readable text was found (scanned image or unsupported format), so the assistant cannot answer from this file.'
        : 'Published. Students can see it now.');
  } else if (f.id === 'student-form') {
    if (!data.program) delete data.program; // leave the class unchanged when left blank
    guarded(() => api('/students', { method: 'POST', body: data }), 'Student saved.');
  } else if (f.id === 'thought-form') {
    guarded(() => api('/settings/thought', { method: 'PUT', body: { text: data.text } }), 'Saved.');
  }
});

/* ---------- AI assistant ---------- */
// Tiny, safe formatter: escapes everything, then supports **bold** and bullet lists.
const fmtMsg = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/^[*-] /gm, '• ');

function renderAssistant() {
  const w = $('#aiw');
  if (!S.user || ['welcome', 'login'].includes(S.view)) { w.innerHTML = ''; return; }
  const admin = S.user.role === 'admin';
  const hi = admin
    ? 'Hi! Ask me how to upload files, register students, import timetables or mark attendance.'
    : 'Hi! I can help with your timetable, attendance and notes. What would you like to know?';
  const ideas = admin ? ['How do I import a timetable?', 'How do I mark attendance?'] : ['What is my next class?', 'Is my attendance okay?', 'Find notes by course code'];
  const all = [{ r: 'a', t: hi }, ...S.chat];
  const msgs = all.map((m, i) => `<div class="b ${m.r}${i === all.length - 1 && S.chat.length ? ' fresh' : ''}">${m.r === 'a' ? fmtMsg(m.t) : esc(m.t)}</div>`).join('')
    + (S.aiBusy ? '<div class="b a typing"><i></i><i></i><i></i></div>' : '')
    + (!S.chat.length && !S.aiBusy ? `<div class="sugs">${ideas.map((q) => `<button data-act="ai-suggest" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>` : '');
  const pop = S.aiPop;
  S.aiPop = false;
  w.innerHTML = `<button class="fab" data-act="ai-toggle" aria-label="Open assistant">${ic('sparkles', 26)}</button>` + (S.aiOpen
    ? `<div class="aip${pop ? ' pop' : ''}"><div class="aih"><span class="ai-av">${ic('sparkles', 20)}</span><div><strong>Campus Assistant</strong><small>Ask about your timetable, notes & more</small></div>
       <button data-act="ai-toggle" aria-label="Close">${ic('x', 17)}</button></div>
       <div class="aim" id="aim">${msgs}</div>
       <div class="aif"><input id="aiq" placeholder="Type your question…" maxlength="2000" autocomplete="off"><button class="p" data-act="ai-send" aria-label="Send">${ic('send', 18)}</button></div></div>` : '');
  const box = $('#aim');
  if (box) box.scrollTop = box.scrollHeight;
}

async function sendChat() {
  const input = $('#aiq');
  const q = input?.value.trim();
  if (!q || S.aiBusy) return;
  S.chat.push({ r: 'u', t: q });
  S.aiBusy = true;
  renderAssistant();
  try {
    const messages = S.chat.slice(-9).map((m) => ({ role: m.r === 'u' ? 'user' : 'assistant', content: m.t }));
    while (messages.length && messages[0].role !== 'user') messages.shift();
    const { reply } = await api('/assistant/chat', { method: 'POST', body: { messages } });
    S.chat.push({ r: 'a', t: reply || 'Sorry, I have no answer for that.' });
  } catch (err) {
    S.chat.push({ r: 'a', t: err.message === 'Session expired' ? 'Please log in again.' : err.message });
  }
  S.aiBusy = false;
  renderAssistant();
  $('#aiq')?.focus();
}

boot();
