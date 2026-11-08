import bcrypt from 'bcryptjs';
import { db } from '../src/db.js';

const id = process.env.ADMIN_ID || 'admin';
const password = process.env.ADMIN_PASSWORD;
const name = process.env.ADMIN_NAME || 'Portal Admin';

if (!password || password.length < 8) {
  console.error('Set ADMIN_PASSWORD (min 8 chars) in your .env first.');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);
db.prepare(
  `INSERT INTO users (role, enrollment, name, password_hash) VALUES ('admin', ?, ?, ?)
   ON CONFLICT(enrollment) DO UPDATE SET name = excluded.name, password_hash = excluded.password_hash WHERE role = 'admin'`,
).run(id, name, hash);
console.log(`Admin "${id}" is ready.`);
