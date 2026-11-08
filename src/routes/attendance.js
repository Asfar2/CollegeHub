import { Router } from 'express';
import { z } from 'zod';
import { db, transaction } from '../db.js';
import { ROLES } from '../constants.js';
import { ApiError } from '../middleware/error.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { courseReport, getCourse, studentSummary, todayISO } from '../services/attendance.js';

const router = Router();
router.use(authenticate);

/* ---------- validation ---------- */
const courseId = z.coerce.number().int().positive();
const period = z.coerce.number().int().min(1).max(10).default(1);
const isRealDate = (d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d);
const anyDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').refine(isRealDate, 'Invalid date');
const pastOrToday = anyDate.refine((d) => d <= todayISO(), 'Attendance cannot be recorded for a future date');

const sheetQuery = z.object({ course_id: courseId, date: pastOrToday, period });
const sessionQuery = z.object({ course_id: courseId, date: anyDate, period });
const courseQuery = z.object({ course_id: courseId });
const markSchema = z.object({
  course_id: courseId,
  date: pastOrToday,
  period,
  records: z.array(z.object({ student_id: z.coerce.number().int().positive(), status: z.enum(['P', 'A']) })).min(1).max(1000),
});

/* ---------- student ---------- */
router.get('/me', requireRole(ROLES.STUDENT), (req, res) => res.json(studentSummary(req.user.id)));

router.get('/me/records', requireRole(ROLES.STUDENT), validate(courseQuery, 'query'), (req, res) => {
  const enrolled = db.prepare('SELECT 1 AS ok FROM enrollments WHERE course_id = ? AND student_id = ?').get(req.query.course_id, req.user.id);
  if (!enrolled) throw new ApiError(404, 'Course not found');
  const records = db
    .prepare('SELECT date, period, status FROM attendance WHERE course_id = ? AND student_id = ? ORDER BY date DESC, period DESC')
    .all(req.query.course_id, req.user.id);
  res.json({ records });
});

/* ---------- admin ---------- */
router.use(requireRole(ROLES.ADMIN));

// Class list for a date/period, with any marks already saved.
router.get('/sheet', validate(sheetQuery, 'query'), (req, res) => {
  const { course_id, date, period: p } = req.query;
  const course = getCourse(course_id);
  const students = db
    .prepare(
      `SELECT u.id, u.enrollment, u.name, a.status
         FROM enrollments e
         JOIN users u ON u.id = e.student_id
         LEFT JOIN attendance a ON a.course_id = e.course_id AND a.student_id = u.id AND a.date = ? AND a.period = ?
        WHERE e.course_id = ?
        ORDER BY u.enrollment`,
    )
    .all(date, p, course_id);
  res.json({ course, date, period: p, marked: students.some((s) => s.status), students });
});

// Saves (or corrects) attendance for one class. Every enrolled student must be included.
router.post('/mark', validate(markSchema), (req, res) => {
  const { course_id, date, period: p, records } = req.body;
  getCourse(course_id);
  const roster = db.prepare('SELECT student_id FROM enrollments WHERE course_id = ?').all(course_id).map((r) => r.student_id);
  const ids = records.map((r) => r.student_id);
  if (new Set(ids).size !== ids.length) throw new ApiError(400, 'A student appears more than once');
  if (ids.some((id) => !roster.includes(id))) throw new ApiError(400, 'Some students are not enrolled in this course');
  const missing = roster.filter((id) => !ids.includes(id));
  if (missing.length) throw new ApiError(400, `Please mark every student (${missing.length} missing)`);

  transaction(() => {
    const upsert = db.prepare(
      `INSERT INTO attendance (course_id, student_id, date, period, status, marked_by)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(course_id, student_id, date, period)
       DO UPDATE SET status = excluded.status, marked_by = excluded.marked_by, marked_at = datetime('now')`,
    );
    for (const r of records) upsert.run(course_id, r.student_id, date, p, r.status, req.user.id);
  });
  const present = records.filter((r) => r.status === 'P').length;
  res.json({ saved: records.length, present, absent: records.length - present });
});

router.get('/sessions', validate(courseQuery, 'query'), (req, res) => {
  getCourse(req.query.course_id);
  const sessions = db
    .prepare(
      `SELECT date, period, COUNT(*) AS total, SUM(status = 'P') AS present
         FROM attendance WHERE course_id = ? GROUP BY date, period ORDER BY date DESC, period DESC LIMIT 200`,
    )
    .all(req.query.course_id);
  res.json({ sessions });
});

router.delete('/sessions', validate(sessionQuery, 'query'), (req, res) => {
  const { course_id, date, period: p } = req.query;
  const info = db.prepare('DELETE FROM attendance WHERE course_id = ? AND date = ? AND period = ?').run(course_id, date, p);
  if (!info.changes) throw new ApiError(404, 'Session not found');
  res.status(204).end();
});

router.get('/report', validate(courseQuery, 'query'), (req, res) => res.json(courseReport(req.query.course_id)));

// Spreadsheet-safe CSV (cells starting with = + - @ are neutralised against formula injection).
const csvCell = (value) => {
  let s = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

router.get('/report.csv', validate(courseQuery, 'query'), (req, res) => {
  const r = courseReport(req.query.course_id);
  const header = ['Enrollment', 'Name', 'Classes held', 'Present', 'Absent', 'Percentage', 'Status'];
  const lines = r.students.map((s) =>
    [s.enrollment, s.name, s.total, s.present, s.absent, s.percent ?? '', s.shortage ? `Shortage (below ${r.min}%)` : 'OK'].map(csvCell).join(','),
  );
  res.attachment(`attendance-${r.course.code}.csv`);
  res.send(`\uFEFF${[header.join(','), ...lines].join('\r\n')}\r\n`);
});

export default router;
