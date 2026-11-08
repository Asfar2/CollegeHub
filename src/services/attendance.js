import { db } from '../db.js';
import { config } from '../config.js';
import { ApiError } from '../middleware/error.js';

export const todayISO = () => new Date().toLocaleDateString('en-CA', { timeZone: config.timezone });

/**
 * Attendance figures for one student in one course (or overall).
 * Integer maths avoids floating-point surprises right at the threshold.
 *  - shortage: attendance is below `min` percent
 *  - needed:   how many classes in a row must be attended to reach `min`
 *  - can_miss: how many more classes can be missed while staying at or above `min`
 */
export function summarize(present, total, min = config.attendanceMin) {
  const shortage = total > 0 && present * 100 < min * total;
  return {
    total,
    present,
    absent: total - present,
    percent: total ? Math.round((present / total) * 1000) / 10 : null,
    shortage,
    needed: shortage ? Math.ceil((min * total - 100 * present) / (100 - min)) : 0,
    can_miss: total > 0 && !shortage ? Math.floor((100 * present) / min - total) : 0,
  };
}

export function getCourse(id) {
  const course = db.prepare('SELECT id, code, name FROM courses WHERE id = ?').get(id);
  if (!course) throw new ApiError(404, 'Course not found');
  return course;
}

export function studentSummary(studentId, min = config.attendanceMin) {
  const rows = db
    .prepare(
      `SELECT c.id, c.code, c.name, COUNT(a.status) AS total, COALESCE(SUM(a.status = 'P'), 0) AS present
         FROM enrollments e
         JOIN courses c ON c.id = e.course_id
         LEFT JOIN attendance a ON a.course_id = c.id AND a.student_id = e.student_id
        WHERE e.student_id = ?
        GROUP BY c.id
        ORDER BY c.code`,
    )
    .all(studentId);
  const courses = rows.map((r) => ({ id: r.id, code: r.code, name: r.name, ...summarize(r.present, r.total, min) }));
  const total = rows.reduce((n, r) => n + r.total, 0);
  const present = rows.reduce((n, r) => n + r.present, 0);
  return { min, overall: summarize(present, total, min), courses };
}

export function courseReport(courseId, min = config.attendanceMin) {
  const course = getCourse(courseId);
  const sessions = db
    .prepare('SELECT COUNT(*) AS n FROM (SELECT DISTINCT date, period FROM attendance WHERE course_id = ?)')
    .get(courseId).n;
  const students = db
    .prepare(
      `SELECT u.id, u.enrollment, u.name, COUNT(a.status) AS total, COALESCE(SUM(a.status = 'P'), 0) AS present
         FROM enrollments e
         JOIN users u ON u.id = e.student_id
         LEFT JOIN attendance a ON a.course_id = e.course_id AND a.student_id = u.id
        WHERE e.course_id = ?
        GROUP BY u.id
        ORDER BY u.enrollment`,
    )
    .all(courseId)
    .map((r) => ({ id: r.id, enrollment: r.enrollment, name: r.name, ...summarize(r.present, r.total, min) }));
  return { course, min, sessions, students };
}
