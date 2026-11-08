import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { db } from '../db.js';
import { ApiError, asyncHandler } from '../middleware/error.js';
import { authenticate, signToken } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
});

// Pre-computed hash so response time doesn't reveal whether an account exists.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 12);

const loginSchema = z.object({
  enrollment: z.string().trim().min(1).max(40),
  password: z.string().min(1).max(200),
});

router.post(
  '/login',
  loginLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { enrollment, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE enrollment = ?').get(enrollment);
    const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
    if (!user || !ok) throw new ApiError(401, 'Wrong enrollment number or password');
    res.json({
      token: signToken(user),
      user: { id: user.id, role: user.role, enrollment: user.enrollment, name: user.name, program: user.program },
    });
  }),
);

router.get('/me', authenticate, (req, res) => res.json({ user: req.user }));

const changeSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, 'Use at least 8 characters').max(200),
});

router.post(
  '/change-password',
  authenticate,
  validate(changeSchema),
  asyncHandler(async (req, res) => {
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!(await bcrypt.compare(req.body.currentPassword, row.password_hash))) {
      throw new ApiError(400, 'Current password is incorrect');
    }
    const hash = await bcrypt.hash(req.body.newPassword, 12);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
    res.json({ ok: true });
  }),
);

export default router;
