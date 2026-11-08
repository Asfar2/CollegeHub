'use strict';
/* Timetable: weekly grid + today's schedule for students, and an entry/import manager for admins.
   Loaded after app.js and uses its globals (S, api, esc, $, flash, render). */

Object.assign(S, {
  ttData: null,
  tt: { tab: 'weekly', data: null },
  ttm: { cls: '', data: null, edit: null, importText: '', mode: 'replace', msg: '', bad: false },
});

const todayDow = () => ((new Date().getDay() + 6) % 7) + 1; // Monday = 1 ... Sunday = 7
const toMins = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const t12 = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const nowMins = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
const currentPeriod = (d) => d.periods.find((p) => nowMins() >= toMins(p.start) && nowMins() < toMins(p.end))?.no ?? null;

/* ---------- shared rendering ---------- */

const hue = (s) => [...String(s)].reduce((a, c) => a + c.charCodeAt(0) * 7, 0) % 360; // stable colour per course

function ttEntry(e, admin) {
  return `<div class="tte" style="--c:${hue(e.course_code)}"><strong>${esc(e.course_code)}</strong>${e.group_name ? `<span class="tag">${esc(e.group_name)}</span>` : ''}
    ${e.course_name ? `<div class="mut">${esc(e.course_name)}</div>` : ''}${e.teacher ? `<div>${esc(e.teacher)}</div>` : ''}${e.room ? `<div class="mut">${esc(e.room)}</div>` : ''}
    ${admin ? `<div class="tta"><button data-act="tt-edit" data-id="${e.id}" aria-label="Edit">✎</button><button class="d" data-act="tt-del" data-id="${e.id}" aria-label="Delete">✕</button></div>` : ''}</div>`;
}

function ttGrid(d, admin = false) {
  const today = todayDow();
  const nowP = currentPeriod(d);
  const cols = [];
  d.periods.forEach((p) => { cols.push({ p }); if (p.no === d.break.after) cols.push({ brk: true }); });

  const head = cols.map((c) => (c.brk
    ? `<th class="ttb">${esc(d.break.label)}<div class="ttt">${t12(d.break.start)} – ${t12(d.break.end)}</div></th>`
    : `<th><span class="ttn">${c.p.no}</span><div class="ttt">${t12(c.p.start)} – ${t12(c.p.end)}</div></th>`)).join('');

  const rows = d.days.map((name, i) => {
    const day = i + 1;
    const cells = cols.map((c) => {
      if (c.brk) return i === 0 ? `<td class="ttb" rowspan="${d.days.length}"><span class="ttv">${esc(d.break.label.toUpperCase())}</span></td>` : '';
      const list = d.entries.filter((e) => e.day === day && e.period === c.p.no);
      return `<td class="${day === today && c.p.no === nowP ? 'ttnow' : ''}">${list.map((e) => ttEntry(e, admin)).join('')}</td>`;
    }).join('');
    return `<tr class="${day === today ? 'tttoday' : ''}"><th class="ttd">${esc(name)}</th>${cells}</tr>`;
  }).join('');

  return `<div class="scroll"><table class="ttgrid"><thead><tr><th class="ttd">Day / Period</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

function ttToday(d) {
  const day = todayDow();
  const nowP = currentPeriod(d);
  const todays = d.entries.filter((e) => e.day === day);
  const title = `<h3>${esc(d.days[day - 1])}, ${new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}</h3>`;
  if (!todays.length) return `<div class="card">${title}<div class="mut">No classes are scheduled today.</div></div>`;

  const rows = [];
  d.periods.forEach((p) => {
    const list = todays.filter((e) => e.period === p.no);
    rows.push(`<div class="it ${p.no === nowP ? 'ttnowrow' : ''}"><span><strong>Period ${p.no}</strong><div class="mut">${t12(p.start)} – ${t12(p.end)}</div></span>
      <span class="ttlist">${list.length ? list.map((e) => ttEntry(e, false)).join('') : '<span class="mut">Free</span>'}</span></div>`);
    if (p.no === d.break.after) rows.push(`<div class="it"><span class="mut">${esc(d.break.label)} · ${t12(d.break.start)} – ${t12(d.break.end)}</span></div>`);
  });
  return `<div class="card">${title}${rows.join('')}</div>`;
}

/* ---------- student ---------- */

// Today's next class, shared by the dashboard tile and card.
function ttNextInfo() {
  const d = S.ttData;
  if (!d || !d.class_name || !d.entries.length) return null;
  const todays = d.entries.filter((e) => e.day === todayDow());
  const next = todays
    .map((e) => ({ e, p: d.periods.find((p) => p.no === e.period) }))
    .filter((x) => x.p && toMins(x.p.end) > nowMins())
    .sort((a, b) => toMins(a.p.start) - toMins(b.p.start))[0];
  return { d, todays, next };
}

function ttTileText() {
  const info = ttNextInfo();
  if (!info) return 'Not published yet';
  if (!info.todays.length) return 'No classes today';
  if (!info.next) return 'No more classes today';
  const { e, p } = info.next;
  return `Next: ${e.course_code} at ${t12(p.start)}${e.room ? ` · ${e.room}` : ''}`;
}

function ttDashboardCard(items) {
  const files = items.map((f) => `<div class="it"><span class="it-l">${ic('file', 16)}<button class="lnk" data-act="open" data-id="${f.id}">${esc(f.title)}</button></span></div>`).join('');
  const info = ttNextInfo();
  const body = !info
    ? '<div class="mut">Your class timetable has not been published yet.</div>'
    : `<div class="it"><span class="it-l">${esc(ttTileText())}<span class="tag">${esc(info.d.class_name)}</span></span>
        <span><button data-act="tt-open" data-tab="today">Today</button> <button class="p" data-act="tt-open" data-tab="weekly">Weekly ${ic('arrowRight', 15)}</button></span></div>`;
  return `<div class="card">${cardHead('clock', 'My Timetable')}${body}${files}</div>`;
}

async function openTimetable(tab, cls) {
  S.tt.data = await api(`/timetable${cls ? `?class=${encodeURIComponent(cls)}` : ''}`);
  S.tt.tab = tab;
  S.view = 'timetable';
  render();
  window.scrollTo(0, 0);
}

function ttStudentPage() {
  const d = S.tt.data;
  const head = pageHead('My Timetable', d && d.class_name ? `Class ${d.class_name}` : 'Weekly schedule', `<button class="ghost" data-act="tt-print">${ic('printer', 16)} Print</button>`);
  if (!d || !d.class_name || !d.entries.length) {
    return `${head}<main><div class="card">${d && d.class_name ? `No timetable has been published for <strong>${esc(d.class_name)}</strong> yet.` : 'No timetable has been published yet.'}</div></main>`;
  }
  const tabs = [['today', 'Today'], ['weekly', 'Weekly']]
    .map(([k, l]) => `<button class="${S.tt.tab === k ? 'on' : ''}" data-act="tt-tab" data-tab="${k}">${l}</button>`).join('');
  const picker = d.classes.length > 1
    ? `<select id="tt-class" style="max-width:240px">${d.classes.map((c) => `<option ${c === d.class_name ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>` : '';
  return `${head}<main><div id="flash"></div>
    <div class="print-only"><h2>Timetable — ${esc(d.class_name)}</h2></div>
    <div class="tabbar"><div class="tabs2">${tabs}</div><span class="tag">${esc(d.class_name)}</span></div>
    ${picker ? `<div class="noprint">${picker}</div>` : ''}
    ${S.tt.tab === 'today' ? ttToday(d) : `<div class="card">${ttGrid(d)}</div>`}</main>`;
}

/* ---------- admin ---------- */

const ttmSay = (text, bad = false) => { S.ttm.msg = text; S.ttm.bad = bad; render(); };

async function loadTtm(cls) {
  const d = await api(`/timetable${cls ? `?class=${encodeURIComponent(cls)}` : ''}`);
  S.ttm.data = d;
  S.ttm.cls = d.class_name || cls || '';
}

function ttManagerPage() {
  const m = S.ttm;
  const d = m.data;
  const e = m.edit || {};
  const days = (d ? d.days : []).map((n, i) => `<option value="${i + 1}" ${e.day === i + 1 ? 'selected' : ''}>${esc(n)}</option>`).join('');
  const periods = (d ? d.periods : []).map((p) => `<option value="${p.no}" ${e.period === p.no ? 'selected' : ''}>Period ${p.no} (${t12(p.start)})</option>`).join('');
  const classes = (d ? d.classes : []).map((c) => `<option value="${esc(c)}"></option>`).join('');
  const hasEntries = d && d.entries.length > 0;

  return `${pageHead('Timetable manager', 'Enter or import weekly class timetables')}
  <main>${m.msg ? `<div class="msg ${m.bad ? 'err' : ''}">${esc(m.msg)}</div>` : ''}
    <div class="card"><h3>Class timetable</h3>
      <div class="srow"><div><label>Class / program (e.g. DSAI-C). Students see the timetable of the class set on their account.</label>
        <input id="tt-cls" list="tt-classes" value="${esc(m.cls)}" placeholder="DSAI-C" maxlength="30"><datalist id="tt-classes">${classes}</datalist></div>
        <div style="align-self:end"><button class="p" data-act="tt-load" style="margin-bottom:12px">Open</button></div></div></div>

    <div class="card"><h3>${m.edit ? 'Edit entry' : 'Add an entry'}</h3>
      <form id="tt-form"><input type="hidden" name="id" value="${m.edit ? m.edit.id : ''}">
        <div class="pair"><div><label>Day</label><select name="day">${days}</select></div><div><label>Period</label><select name="period">${periods}</select></div></div>
        <div class="pair"><div><label>Course code</label><input name="course_code" required maxlength="20" placeholder="CS301" value="${esc(e.course_code)}"></div>
          <div><label>Group (optional)</label><input name="group_name" maxlength="40" placeholder="Group 1" value="${esc(e.group_name)}"></div></div>
        <div class="pair"><div><label>Teacher</label><input name="teacher" maxlength="80" placeholder="Danish Ahmad" value="${esc(e.teacher)}"></div>
          <div><label>Room</label><input name="room" maxlength="40" placeholder="B141" value="${esc(e.room)}"></div></div>
        <label>Course name (optional)</label><input name="course_name" maxlength="120" placeholder="Database Systems" value="${esc(e.course_name)}">
        <button class="p">${m.edit ? 'Update entry' : 'Add entry'}</button> ${m.edit ? '<button type="button" data-act="tt-cancel">Cancel</button>' : ''}</form></div>

    <div class="card"><h3>Bulk import</h3>
      <p class="mut" style="margin-top:0">Paste rows from Excel/Google Sheets or CSV. Columns: <strong>Day, Period, Course code, Group, Teacher, Room</strong> (course name optional). Example:<br><code>Monday,3,CS334,Group 1,Azra Iftekhar,B015</code></p>
      <textarea id="tt-import" rows="7" placeholder="Day,Period,Course code,Group,Teacher,Room">${esc(m.importText)}</textarea>
      <div class="srow"><div><select id="tt-mode"><option value="replace" ${m.mode === 'replace' ? 'selected' : ''}>Replace this class's timetable</option><option value="append" ${m.mode === 'append' ? 'selected' : ''}>Add to the existing timetable</option></select></div>
        <div><button class="p" data-act="tt-import" style="margin-top:4px">Import</button></div></div></div>

    <div class="card"><h3>${d && d.class_name ? `Timetable — ${esc(d.class_name)}` : 'Timetable'}</h3>
      ${hasEntries ? `${ttGrid(d, true)}<div style="margin-top:12px"><button class="d" data-act="tt-clear">Clear this whole timetable</button></div>` : '<div class="mut">No entries for this class yet. Add one above or import a list.</div>'}</div></main>`;
}

/* ---------- events ---------- */

document.addEventListener('click', async (ev) => {
  const t = ev.target.closest('[data-act^="tt-"]');
  if (!t) return;
  const m = S.ttm;
  const id = Number(t.dataset.id);
  const cls = () => ($('#tt-cls')?.value || '').trim();
  try {
    switch (t.dataset.act) {
      case 'tt-open': await openTimetable(t.dataset.tab); break;
      case 'tt-tab': S.tt.tab = t.dataset.tab; render(); break;
      case 'tt-print': window.print(); break;

      case 'tt-manager':
        m.edit = null; m.msg = '';
        await loadTtm(m.cls);
        S.view = 'ttmgr';
        render();
        window.scrollTo(0, 0);
        break;
      case 'tt-load': m.edit = null; m.msg = ''; await loadTtm(cls()); render(); break;
      case 'tt-edit': m.edit = m.data.entries.find((e) => e.id === id); render(); document.getElementById('tt-form')?.scrollIntoView({ behavior: 'smooth' }); break;
      case 'tt-cancel': m.edit = null; render(); break;
      case 'tt-del':
        if (!confirm('Delete this entry?')) break;
        await api(`/timetable/${id}`, { method: 'DELETE' });
        await loadTtm(m.cls); m.edit = null;
        ttmSay('Entry deleted.');
        break;
      case 'tt-clear':
        if (!confirm(`Delete the ENTIRE timetable for ${m.cls}?`)) break;
        await api(`/timetable?class=${encodeURIComponent(m.cls)}`, { method: 'DELETE' });
        await loadTtm(m.cls);
        ttmSay('Timetable cleared.');
        break;
      case 'tt-import': {
        if (!cls()) return ttmSay('Enter the class / program first (for example DSAI-C).', true);
        const res = await api('/timetable/import', { method: 'POST', body: { class_name: cls(), mode: m.mode, csv: m.importText } });
        await loadTtm(res.class_name);
        m.importText = '';
        ttmSay(`Imported ${res.imported} entries into ${res.class_name}.`);
        break;
      }
    }
  } catch (err) {
    if (err.message === 'Session expired') return;
    if (S.view === 'ttmgr') ttmSay(err.message, true); else flash(err.message, true);
  }
});

document.addEventListener('submit', async (ev) => {
  if (ev.target.id !== 'tt-form') return;
  const m = S.ttm;
  const data = Object.fromEntries(new FormData(ev.target));
  const { id } = data;
  delete data.id;
  const cls = ($('#tt-cls')?.value || '').trim();
  if (!cls) return ttmSay('Enter the class / program first (for example DSAI-C).', true);
  try {
    if (id) await api(`/timetable/${id}`, { method: 'PUT', body: data });
    else await api('/timetable', { method: 'POST', body: { ...data, class_name: cls } });
    await loadTtm(cls);
    m.edit = null;
    ttmSay(id ? 'Entry updated.' : 'Entry added.');
  } catch (err) { if (err.message !== 'Session expired') ttmSay(err.message, true); }
});

document.addEventListener('input', (ev) => { if (ev.target.id === 'tt-import') S.ttm.importText = ev.target.value; });

document.addEventListener('change', async (ev) => {
  if (ev.target.id === 'tt-mode') S.ttm.mode = ev.target.value;
  if (ev.target.id === 'tt-class') {
    try { await openTimetable(S.tt.tab, ev.target.value); } catch (err) { if (err.message !== 'Session expired') flash(err.message, true); }
  }
});
