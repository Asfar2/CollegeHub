import { db } from '../db.js';
import { DAYS, PERIODS } from '../constants.js';

export const normClass = (s) => String(s ?? '').trim().toUpperCase().replace(/\s+/g, '');

export const listClasses = () =>
  db.prepare('SELECT DISTINCT class_name FROM timetable ORDER BY class_name').all().map((r) => r.class_name);

export const classEntries = (className) =>
  db
    .prepare('SELECT id, day, period, course_code, course_name, group_name, teacher, room FROM timetable WHERE class_name = ? ORDER BY day, period, id')
    .all(className);

/** Minimal CSV/TSV parser (quotes, escaped quotes, multi-line cells). Returns [{ line, cells }]. */
export function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let line = 1;
  let rowLine = 1;
  const endField = () => { row.push(field); field = ''; };
  const endRow = () => {
    endField();
    if (row.some((c) => c.trim() !== '')) rows.push({ line: rowLine, cells: row });
    row = [];
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else {
        if (ch === '\n') line += 1;
        field += ch;
      }
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === delimiter) endField();
    else if (ch === '\n') { endRow(); line += 1; rowLine = line; }
    else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length) endRow();
  return rows;
}

const parseDay = (value) => {
  const s = String(value ?? '').trim().toLowerCase();
  const n = Number(s);
  if (Number.isInteger(n) && n >= 1 && n <= 7) return n;
  const i = DAYS.findIndex((d) => d.toLowerCase() === s || d.slice(0, 3).toLowerCase() === s);
  return i < 0 ? null : i + 1;
};

/** Columns: Day, Period, Course code, Group, Teacher, Room, Course name (optional). */
export function parseImport(text) {
  const rows = parseDelimited(text, text.includes('\t') ? '\t' : ',');
  const entries = [];
  const errors = [];
  rows.forEach(({ line, cells }, index) => {
    const c = cells.map((x) => x.trim());
    if (index === 0 && c[0].toLowerCase() === 'day') return; // header row
    const [dayRaw, periodRaw, codeRaw, group, teacher, room, courseName] = c;
    const day = parseDay(dayRaw);
    const period = Number(periodRaw);
    const code = (codeRaw || '').toUpperCase().replace(/\s+/g, '');
    if (!day) return errors.push({ line, message: `Unknown day "${dayRaw ?? ''}"` });
    if (!Number.isInteger(period) || period < 1 || period > PERIODS.length) return errors.push({ line, message: `Period must be a number from 1 to ${PERIODS.length}` });
    if (!/^[A-Z0-9_-]{2,20}$/.test(code)) return errors.push({ line, message: 'Missing or invalid course code' });
    if ((group || '').length > 40 || (teacher || '').length > 80 || (room || '').length > 40 || (courseName || '').length > 120) {
      return errors.push({ line, message: 'A value is too long' });
    }
    return entries.push({ day, period, course_code: code, group_name: group || null, teacher: teacher || null, room: room || null, course_name: courseName || null });
  });
  return { entries, errors };
}

/** Plain-text timetable for the AI assistant. */
export function timetableText(className) {
  const entries = classEntries(className);
  if (!entries.length) return null;
  return DAYS.map((name, i) => {
    const today = entries.filter((e) => e.day === i + 1);
    if (!today.length) return `${name}: no classes`;
    const lines = [...new Set(today.map((e) => e.period))].map((p) => {
      const slot = PERIODS.find((x) => x.no === p);
      const items = today
        .filter((e) => e.period === p)
        .map((e) => `${e.course_code}${e.course_name ? ` (${e.course_name})` : ''}${e.group_name ? ` [${e.group_name}]` : ''}${e.teacher ? ` - ${e.teacher}` : ''}${e.room ? ` - Room ${e.room}` : ''}`)
        .join(' | ');
      return `  Period ${p} (${slot?.start}-${slot?.end}): ${items}`;
    });
    return `${name}:\n${lines.join('\n')}`;
  }).join('\n');
}
