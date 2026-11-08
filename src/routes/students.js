import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../db.js';
import { ROLES } from '../constants.js';
import { ApiError, asyncHandler } from '../middleware/error.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { normClass } from '../services/timetable.js';

const router = Router();
router.use(authenticate, requireRole(ROLES.ADMIN));

const studentSchema = z.object({
  enrollment: z.string().trim().min(3).max(40).regex(/^[A-Za-z0-9_-]+$/, 'Letters, numbers, _ and - only'),
  name: z.string().trim().min(2).max(100),
  program: z.string().trim().max(30).optional(),
  password: z.string().min(8, 'Use at least 8 characters').max(200),
});

router.get('/', (_req, res) => {
  const rows = db
    .prepare("SELECT id, enrollment, name, program, created_at FROM users WHERE role = 'student' ORDER BY name")
    .all();
  res.json({ students: rows });
});

// Creates a student, or resets name/password if the enrollment already exists.
router.post(
  '/',
  validate(studentSchema),
  asyncHandler(async (req, res) => {
    const { enrollment, name, password } = req.body;
    const program = normClass(req.body.program) || null; // class/program, e.g. DSAI-C
    const hash = await bcrypt.hash(password, 12);
    const existing = db.prepare('SELECT id, role FROM users WHERE enrollment = ?').get(enrollment);
    if (existing && existing.role !== ROLES.STUDENT) throw new ApiError(409, 'That ID belongs to a staff account');
    if (existing) {
      db.prepare('UPDATE users SET name = ?, password_hash = ?, program = COALESCE(?, program) WHERE id = ?').run(name, hash, program, existing.id);
      return res.json({ id: existing.id, enrollment, name, program, updated: true });
    }
    const info = db
      .prepare("INSERT INTO users (role, enrollment, name, password_hash, program) VALUES ('student', ?, ?, ?, ?)")
      .run(enrollment, name, hash, program);
    res.status(201).json({ id: info.lastInsertRowid, enrollment, name, program, updated: false });
  }),
);

router.delete('/:id', (req, res) => {
  const info = db.prepare("DELETE FROM users WHERE id = ? AND role = 'student'").run(Number(req.params.id));
  if (!info.changes) throw new ApiError(404, 'Student not found');
  res.status(204).end();
});

export default router;
