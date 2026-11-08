import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { asyncHandler } from '../middleware/error.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { askAssistant } from '../services/ai.js';

const router = Router();
router.use(authenticate);

const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 15,
  keyGenerator: (req) => `user:${req.user.id}`,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'You are sending messages too quickly. Please wait a moment.' },
});

const chatSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(2000) }))
    .min(1)
    .max(10)
    .refine((m) => m[0].role === 'user' && m[m.length - 1].role === 'user', 'Conversation must start and end with a user message'),
});

router.post(
  '/chat',
  limiter,
  validate(chatSchema),
  asyncHandler(async (req, res) => {
    const reply = await askAssistant(req.user, req.body.messages);
    res.json({ reply });
  }),
);

export default router;
