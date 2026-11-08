import { DatabaseSync } from 'node:sqlite'; // built into Node 22.5+, no native compilation needed
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
fs.mkdirSync(config.uploadDir, { recursive: true });

export const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    role          TEXT NOT NULL CHECK (role IN ('admin','student')),
    enrollment    TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS files (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    section     TEXT NOT NULL,
    title       TEXT NOT NULL,
    kind        TEXT NOT NULL CHECK (kind IN ('file','link')),
    url         TEXT,
    stored_name TEXT,
    original_name TEXT,
    mime        TEXT,
    size        INTEGER,
    text_content TEXT,
    created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_files_section ON files(section);

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Lightweight migrations for databases created by earlier versions.
const fileColumns = db.prepare('PRAGMA table_info(files)').all().map((c) => c.name);
for (const column of ['course_code', 'course_name']) {
  if (!fileColumns.includes(column)) db.exec(`ALTER TABLE files ADD COLUMN ${column} TEXT`);
}
db.exec('CREATE INDEX IF NOT EXISTS idx_files_course ON files(course_code)');

// Run a function inside a transaction (node:sqlite has no built-in helper).
export function transaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

// Courses, rosters and class attendance.
db.exec(`
  CREATE TABLE IF NOT EXISTS courses (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    code       TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name       TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS enrollments (
    course_id  INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (course_id, student_id)
  );

  CREATE TABLE IF NOT EXISTS attendance (
    course_id  INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date       TEXT NOT NULL,                      -- YYYY-MM-DD
    period     INTEGER NOT NULL DEFAULT 1,         -- several classes per day are allowed
    status     TEXT NOT NULL CHECK (status IN ('P','A')),
    marked_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    marked_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (course_id, student_id, date, period)
  );
  CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id, course_id);
`);

// Class timetables: one row per (class, day, period, subject). A cell may hold several rows (groups).
db.exec(`
  CREATE TABLE IF NOT EXISTS timetable (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    class_name  TEXT NOT NULL COLLATE NOCASE,
    day         INTEGER NOT NULL CHECK (day BETWEEN 1 AND 7),
    period      INTEGER NOT NULL CHECK (period BETWEEN 1 AND 12),
    course_code TEXT NOT NULL,
    course_name TEXT,
    group_name  TEXT,
    teacher     TEXT,
    room        TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_timetable_class ON timetable(class_name, day, period);
`);
// Which class/program a student belongs to (decides which timetable they see by default).
if (!db.prepare('PRAGMA table_info(users)').all().some((c) => c.name === 'program')) {
  db.exec('ALTER TABLE users ADD COLUMN program TEXT');
}
