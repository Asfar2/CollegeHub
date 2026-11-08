import 'dotenv/config';

const required = (key) => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
};

export const config = Object.freeze({
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4000,
  jwtSecret: required('JWT_SECRET'),
  jwtExpires: process.env.JWT_EXPIRES || '8h',
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:3000').split(',').map((s) => s.trim()),
  dbPath: process.env.DB_PATH || './data/portal.db',
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  maxUploadBytes: (Number(process.env.MAX_UPLOAD_MB) || 20) * 1024 * 1024,
  attendanceMin: Math.min(95, Math.max(1, Math.round(Number(process.env.ATTENDANCE_MIN) || 75))), // minimum % required
  timezone: process.env.TIMEZONE || 'Asia/Kolkata',
  // AI assistant. Provider is chosen by AI_PROVIDER ('groq' | 'gemini'); if unset, Groq is used when a Groq key exists.
  groqKey: process.env.GROQ_API_KEY || '',
  groqModel: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
  geminiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  aiProvider: (process.env.AI_PROVIDER || (process.env.GROQ_API_KEY ? 'groq' : 'gemini')).toLowerCase(),
  // Max characters of document text sent per question (keeps requests inside free-tier token limits).
  aiContextChars: Math.max(2000, Number(process.env.AI_CONTEXT_CHARS) || 12000),
});
