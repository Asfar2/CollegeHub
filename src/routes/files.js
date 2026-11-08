import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { config } from '../config.js';
import { db } from '../db.js';
import { ROLES, SECTION_KEYS } from '../constants.js';
import { ApiError, asyncHandler } from '../middleware/error.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();
router.use(authenticate);

const ALLOWED = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
};

const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadDir,
    filename: (_req, file, cb) =>
      cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED[ext]) return cb(new ApiError(400, `File type ${ext || '(none)'} is not allowed`));
    cb(null, true);
  },
});

const PUBLIC_COLUMNS =
  'id, section, title, kind, url, course_code, course_name, original_name, mime, size, ' +
  '(text_content IS NOT NULL AND length(text_content) > 50) AS indexed, created_at, updated_at';
const section = z.enum(SECTION_KEYS);

const courseCode = z.string().trim().max(20).regex(/^[A-Za-z0-9 _-]*$/, 'Course code: letters, numbers, space, - and _ only').optional();
const courseName = z.string().trim().max(120).optional();
const normCode = (v) => (v ?? '').replace(/\s+/g, '').toUpperCase() || null;

const createSchema = z.object({
  section,
  title: z.string().trim().min(2).max(200),
  url: z.string().trim().url().max(2000).optional(),
  course_code: courseCode,
  course_name: courseName,
});
const updateSchema = z.object({
  section: section.optional(),
  title: z.string().trim().min(2).max(200).optional(),
  url: z.string().trim().url().max(2000).optional(),
  course_code: courseCode,
  course_name: courseName,
});

const removeStored = (name) => {
  if (name) fs.promises.unlink(path.join(config.uploadDir, name)).catch(() => {});
};

// Extract searchable text from PDFs/text files so the AI assistant can answer from them.
async function extractText(filePath, ext) {
  try {
    if (ext === '.pdf') return (await pdfParse(await fs.promises.readFile(filePath))).text.slice(0, 200_000);
    if (ext === '.txt' || ext === '.csv') return (await fs.promises.readFile(filePath, 'utf8')).slice(0, 200_000);
  } catch (err) {
    console.warn('Text extraction failed:', err.message);
  }
  return null;
}

router.get('/', (req, res) => {
  const { section: sec, q } = req.query;
  const where = [];
  const args = [];
  if (sec) { where.push('section = ?'); args.push(String(sec)); }
  if (q) {
    const like = `%${String(q).slice(0, 100)}%`;
    where.push('(title LIKE ? OR course_code LIKE ? OR course_name LIKE ?)');
    args.push(like, like, like);
  }
  const sql = `SELECT ${PUBLIC_COLUMNS} FROM files ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY updated_at DESC`;
  res.json({ files: db.prepare(sql).all(...args) });
});

const INLINE_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'text/plain']);
const uploadRoot = () => ({ root: path.resolve(config.uploadDir) });

router.get('/:id/download', (req, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(Number(req.params.id));
  if (!file) throw new ApiError(404, 'File not found');
  if (file.kind === 'link') return res.redirect(file.url);
  res.attachment(file.original_name);
  res.sendFile(file.stored_name, uploadRoot());
});

// Inline preview so PDFs/images open inside the website instead of downloading.
router.get('/:id/view', (req, res) => {
  const file = db.prepare('SELECT * FROM files WHERE id = ?').get(Number(req.params.id));
  if (!file) throw new ApiError(404, 'File not found');
  if (file.kind === 'link') throw new ApiError(400, 'Links open on their own website');
  if (!INLINE_TYPES.has(file.mime)) throw new ApiError(415, 'This file type cannot be previewed. Please download it instead.');
  res.type(file.mime);
  res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(file.original_name)}`);
  res.sendFile(file.stored_name, uploadRoot());
});

router.post(
  '/',
  requireRole(ROLES.ADMIN),
  upload.single('file'),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const { section: sec, title, url } = req.body;
    const code = normCode(req.body.course_code);
    const cname = req.body.course_name || null;
    if (!req.file && !url) throw new ApiError(400, 'Provide a file or a link');
    let row;
    if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase();
      const text = await extractText(req.file.path, ext);
      row = db.prepare(
        `INSERT INTO files (section, title, kind, stored_name, original_name, mime, size, text_content, course_code, course_name, created_by)
         VALUES (?, ?, 'file', ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(sec, title, req.file.filename, req.file.originalname, ALLOWED[ext], req.file.size, text, code, cname, req.user.id);
    } else {
      row = db.prepare(`INSERT INTO files (section, title, kind, url, course_code, course_name, created_by) VALUES (?, ?, 'link', ?, ?, ?, ?)`)
        .run(sec, title, url, code, cname, req.user.id);
    }
    res.status(201).json(db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM files WHERE id = ?`).get(row.lastInsertRowid));
  }),
);

// Update metadata and/or replace the stored file.
router.put(
  '/:id',
  requireRole(ROLES.ADMIN),
  upload.single('file'),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const current = db.prepare('SELECT * FROM files WHERE id = ?').get(id);
    if (!current) {
      if (req.file) removeStored(req.file.filename);
      throw new ApiError(404, 'File not found');
    }
    const next = {
      section: req.body.section ?? current.section,
      title: req.body.title ?? current.title,
      url: req.body.url ?? current.url,
      course_code: req.body.course_code !== undefined ? normCode(req.body.course_code) : current.course_code,
      course_name: req.body.course_name !== undefined ? req.body.course_name || null : current.course_name,
      stored_name: current.stored_name,
      original_name: current.original_name,
      mime: current.mime,
      size: current.size,
      text_content: current.text_content,
    };
    if (req.file) {
      if (current.kind !== 'file') { removeStored(req.file.filename); throw new ApiError(400, 'This item is a link, not a file'); }
      const ext = path.extname(req.file.originalname).toLowerCase();
      Object.assign(next, {
        stored_name: req.file.filename,
        original_name: req.file.originalname,
        mime: ALLOWED[ext],
        size: req.file.size,
        text_content: await extractText(req.file.path, ext),
      });
      removeStored(current.stored_name);
    }
    db.prepare(
      `UPDATE files SET section=?, title=?, url=?, course_code=?, course_name=?, stored_name=?, original_name=?, mime=?, size=?,
       text_content=?, updated_at=datetime('now') WHERE id=?`,
    ).run(next.section, next.title, next.url, next.course_code, next.course_name, next.stored_name, next.original_name, next.mime, next.size, next.text_content, id);
    res.json(db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM files WHERE id = ?`).get(id));
  }),
);

router.delete('/:id', requireRole(ROLES.ADMIN), (req, res) => {
  const file = db.prepare('SELECT stored_name FROM files WHERE id = ?').get(Number(req.params.id));
  if (!file) throw new ApiError(404, 'File not found');
  db.prepare('DELETE FROM files WHERE id = ?').run(Number(req.params.id));
  removeStored(file.stored_name);
  res.status(204).end();
});

export default router;
