import { Router } from 'express';
import { z } from 'zod';
import { db, transaction } from '../db.js';
import { ROLES } from '../constants.js';
import { ApiError } from '../middleware/error.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { getCourse } from '../services/attendance.js';

const router = Router();
router.use(authenticate);

const courseSchema = z.object({
  code: z.string().trim().min(2).max(20).regex(/^[A-Za-z0-9_-]+$/, 'Course code: letters, numbers, - and _ only').transform((s) => s.toUpperCase()),
  name: z.string().trim().min(2).max(120),
});
const rosterSchema = z.object({ enrollments: z.array(z.string().trim().min(1).max(40)).max(1000) });
const idOf = (req) => Number(req.params.id);

// Admins see every course; students see the courses they are enrolled in.
router.get('/', (req, res) => {
  const rows = req.user.role === ROLES.ADMIN
    ? db.prepare('SELECT c.id, c.code, c.name, (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) AS student_count FROM courses c ORDER BY c.code').all()
    : db.prepare('SELECT c.id, c.code, c.name FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE e.student_id = ? ORDER BY c.code').all(req.user.id);
  res.json({ courses: rows });
});

// Creates a course, or renames it if the code already exists.
router.post('/', requireRole(ROLES.ADMIN), validate(courseSchema), (req, res) => {
  const { code, name } = req.body;
  const existing = db.prepare('SELECT id FROM courses WHERE code = ?').get(code);
  if (existing) {
    db.prepare('UPDATE courses SET name = ? WHERE id = ?').run(name, existing.id);
    return res.json({ id: existing.id, code, name, updated: true });
  }
  const info = db.prepare('INSERT INTO courses (code, name) VALUES (?, ?)').run(code, name);
  res.status(201).json({ id: info.lastInsertRowid, code, name, updated: false });
});

router.delete('/:id', requireRole(ROLES.ADMIN), (req, res) => {
  getCourse(idOf(req));
  db.prepare('DELETE FROM courses WHERE id = ?').run(idOf(req)); // enrollments + attendance cascade
  res.status(204).end();
});

router.get('/:id/students', requireRole(ROLES.ADMIN), (req, res) => {
  const course = getCourse(idOf(req));
  const students = db
    .prepare('SELECT u.id, u.enrollment, u.name FROM enrollments e JOIN users u ON u.id = e.student_id WHERE e.course_id = ? ORDER BY u.enrollment')
    .all(course.id);
  res.json({ course, students });
});

// Replaces the class roster with the given enrollment numbers.
router.put('/:id/students', requireRole(ROLES.ADMIN), validate(rosterSchema), (req, res) => {
  const course = getCourse(idOf(req));
  const unique = [...new Set(req.body.enrollments.map((e) => e.toUpperCase()))];
  const found = [];
  const unknown = [];
  for (const enrollment of unique) {
    const user = db.prepare("SELECT id FROM users WHERE enrollment = ? AND role = 'student'").get(enrollment);
    if (user) found.push(user.id); else unknown.push(enrollment);
  }
  transaction(() => {
    db.prepare('DELETE FROM enrollments WHERE course_id = ?').run(course.id);
    const insert = db.prepare('INSERT INTO enrollments (course_id, student_id) VALUES (?, ?)');
    for (const studentId of found) insert.run(course.id, studentId);
  });
  res.json({ enrolled: found.length, unknown });
});

export default router;
