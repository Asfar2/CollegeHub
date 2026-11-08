import { Router } from 'express';
import { z } from 'zod';
import { db, transaction } from '../db.js';
import { BREAK, DAYS, PERIODS, ROLES } from '../constants.js';
import { ApiError } from '../middleware/error.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { classEntries, listClasses, normClass, parseImport } from '../services/timetable.js';

const router = Router();
router.use(authenticate);

const text = (max) => z.string().trim().max(max).optional().transform((v) => v || null);
const entrySchema = z.object({
  class_name: z.string().trim().min(1).max(30).transform(normClass),
  day: z.coerce.number().int().min(1).max(7),
  period: z.coerce.number().int().min(1).max(PERIODS.length),
  course_code: z.string().trim().min(2).max(20).regex(/^[A-Za-z0-9 _-]+$/, 'Course code: letters, numbers, - and _ only').transform((s) => s.toUpperCase().replace(/\s+/g, '')),
  course_name: text(120),
  group_name: text(40),
  teacher: text(80),
  room: text(40),
});
const importSchema = z.object({
  class_name: z.string().trim().min(1).max(30).transform(normClass),
  mode: z.enum(['replace', 'append']).default('replace'),
  csv: z.string().min(3).max(300_000),
});
const classQuery = z.object({ class: z.string().trim().max(30).optional() });

const COLUMNS = 'class_name, day, period, course_code, course_name, group_name, teacher, room';
const insertSql = `INSERT INTO timetable (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
const values = (e) => [e.class_name, e.day, e.period, e.course_code, e.course_name, e.group_name, e.teacher, e.room];

// Weekly timetable for a class. Students default to their own class; admins to the first class.
router.get('/', validate(classQuery, 'query'), (req, res) => {
  const classes = listClasses();
  const wanted = req.query.class ? normClass(req.query.class) : normClass(req.user.program) || classes[0] || null;
  res.json({
    class_name: wanted,
    classes,
    days: DAYS,
    periods: PERIODS,
    break: BREAK,
    entries: wanted ? classEntries(wanted) : [],
  });
});

router.use(requireRole(ROLES.ADMIN));

router.post('/', validate(entrySchema), (req, res) => {
  const info = db.prepare(insertSql).run(...values(req.body));
  res.status(201).json({ id: info.lastInsertRowid });
});

router.put('/:id', validate(entrySchema.omit({ class_name: true })), (req, res) => {
  const b = req.body;
  const info = db
    .prepare('UPDATE timetable SET day = ?, period = ?, course_code = ?, course_name = ?, group_name = ?, teacher = ?, room = ? WHERE id = ?')
    .run(b.day, b.period, b.course_code, b.course_name, b.group_name, b.teacher, b.room, Number(req.params.id));
  if (!info.changes) throw new ApiError(404, 'Entry not found');
  res.json({ ok: true });
});

router.delete('/:id', (req, res) => {
  const info = db.prepare('DELETE FROM timetable WHERE id = ?').run(Number(req.params.id));
  if (!info.changes) throw new ApiError(404, 'Entry not found');
  res.status(204).end();
});

// Clears a whole class timetable.
router.delete('/', validate(z.object({ class: z.string().trim().min(1).max(30) }), 'query'), (req, res) => {
  db.prepare('DELETE FROM timetable WHERE class_name = ?').run(normClass(req.query.class));
  res.status(204).end();
});

// Bulk import from CSV / pasted spreadsheet rows. All-or-nothing: any bad row rejects the whole import.
router.post('/import', validate(importSchema), (req, res) => {
  const { class_name: className, mode, csv } = req.body;
  const { entries, errors } = parseImport(csv);
  if (errors.length) {
    throw new ApiError(400, 'Nothing was imported. Please fix these rows', errors.slice(0, 15).map((e) => ({ field: `line ${e.line}`, message: `Line ${e.line}: ${e.message}` })));
  }
  if (!entries.length) throw new ApiError(400, 'No timetable rows were found');
  if (entries.length > 2000) throw new ApiError(400, 'Too many rows (limit 2000)');
  transaction(() => {
    if (mode === 'replace') db.prepare('DELETE FROM timetable WHERE class_name = ?').run(className);
    const insert = db.prepare(insertSql);
    for (const e of entries) insert.run(...values({ ...e, class_name: className }));
  });
  res.json({ imported: entries.length, class_name: className });
});

export default router;
