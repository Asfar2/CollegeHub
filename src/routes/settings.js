import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { ROLES, SECTIONS } from '../constants.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();
router.use(authenticate);

const DEFAULT_THOUGHT = 'Follow your passion, listen to your dreams, believe in yourself and all good things will come your way.';

export const getThought = () =>
  db.prepare("SELECT value FROM settings WHERE key = 'thought'").get()?.value ?? DEFAULT_THOUGHT;

router.get('/sections', (_req, res) => res.json(SECTIONS));
router.get('/thought', (_req, res) => res.json({ text: getThought() }));

router.put(
  '/thought',
  requireRole(ROLES.ADMIN),
  validate(z.object({ text: z.string().trim().min(1).max(300) })),
  (req, res) => {
    db.prepare("INSERT INTO settings (key, value) VALUES ('thought', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(req.body.text);
    res.json({ text: req.body.text });
  },
);

export default router;
