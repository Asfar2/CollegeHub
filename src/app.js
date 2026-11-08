import express from 'express';
import { fileURLToPath } from 'node:url';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { errorHandler, notFound } from './middleware/error.js';
import authRoutes from './routes/auth.js';
import studentRoutes from './routes/students.js';
import fileRoutes from './routes/files.js';
import settingsRoutes from './routes/settings.js';
import assistantRoutes from './routes/assistant.js';
import courseRoutes from './routes/courses.js';
import attendanceRoutes from './routes/attendance.js';
import timetableRoutes from './routes/timetable.js';

export const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        // The portal previews PDFs/images in an iframe fed by a blob: URL.
        'frame-src': ["'self'", 'blob:'],
        'object-src': ["'self'", 'blob:'],
        'img-src': ["'self'", 'data:', 'blob:'],
      },
    },
  }),
);
app.use(cors({ origin: config.corsOrigins, methods: ['GET', 'POST', 'PUT', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization'] }));
app.use(express.json({ limit: '100kb' }));
app.use(rateLimit({ windowMs: 60 * 1000, limit: 200, standardHeaders: 'draft-7', legacyHeaders: false }));

app.get('/api/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
app.use('/api/auth', authRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/assistant', assistantRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/timetable', timetableRoutes);

// Serve the bundled frontend (same origin as the API, so no CORS setup is needed).
app.use(express.static(fileURLToPath(new URL('../public', import.meta.url))));

app.use(notFound);
app.use(errorHandler);
