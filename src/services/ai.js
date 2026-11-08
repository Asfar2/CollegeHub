import { config } from '../config.js';
import { db } from '../db.js';
import { BREAK, PERIODS, SECTIONS } from '../constants.js';
import { ApiError } from '../middleware/error.js';
import { getThought } from '../routes/settings.js';
import { studentSummary } from './attendance.js';
import { listClasses, normClass, timetableText } from './timetable.js';
import { attendanceAnswer, isAttendanceOnly, isAttendanceQuestion } from './attendanceAnswer.js';

/**
 * Campus assistant. Providers: Groq (default when GROQ_API_KEY is set, https://console.groq.com)
 * or Google Gemini. Flow: attendance-only questions are answered directly from live data;
 * otherwise gather document text -> build a system prompt -> call the provider.
 */
const GEMINI_URL = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callGemini(system, messages, attempt = 0) {
  if (!config.geminiKey) throw new ApiError(503, 'The AI assistant is not configured (missing GEMINI_API_KEY)');

  const res = await fetch(GEMINI_URL(config.geminiModel), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.geminiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user', // Gemini calls the assistant role "model"
        parts: [{ text: m.content }],
      })),
      generationConfig: { maxOutputTokens: 2000, temperature: 0.3 },
    }),
    signal: AbortSignal.timeout(45_000),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    console.error(`Gemini error ${res.status}:`, data?.error?.message);
    if ((res.status === 503 || res.status === 500) && attempt < 1) {
      await sleep(1500);
      return callGemini(system, messages, attempt + 1);
    }
    if (res.status === 429) throw new ApiError(429, 'The assistant is busy (free-tier limit reached). Please try again in a minute.');
    if (res.status === 400 || res.status === 403) throw new ApiError(503, 'The AI assistant is not configured correctly (check GEMINI_API_KEY and GEMINI_MODEL)');
    if (res.status === 404) throw new ApiError(503, 'The configured Gemini model was not found (check GEMINI_MODEL)');
    throw new ApiError(502, 'The assistant is temporarily unavailable');
  }

  const candidate = data.candidates?.[0];
  const text = (candidate?.content?.parts ?? []).map((p) => p.text ?? '').join('').trim();
  if (!text) {
    console.warn('Gemini returned no text:', data.promptFeedback?.blockReason || candidate?.finishReason);
    return 'Sorry, I could not answer that. Try rephrasing your question.';
  }
  return text;
}

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

async function callGroq(system, messages, attempt = 0) {
  if (!config.groqKey) throw new ApiError(503, 'The AI assistant is not configured (missing GROQ_API_KEY)');

  let res;
  try {
    res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.groqKey}` },
      body: JSON.stringify({
        model: config.groqModel,
        messages: [{ role: 'system', content: system }, ...messages.map((m) => ({ role: m.role, content: m.content }))],
        temperature: 0.3,
        max_tokens: 2000, // reasoning models spend part of this on thinking, so leave room for the answer
        // gpt-oss models reason before answering; "low" keeps replies fast and cheap for portal questions.
        ...(/gpt-oss/i.test(config.groqModel) ? { reasoning_effort: 'low' } : {}),
      }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch (err) {
    console.error('Groq request failed:', err.name, err.message);
    throw new ApiError(502, err.name === 'TimeoutError' ? 'The assistant took too long to answer. Please try again.' : 'Could not reach the AI service. Check the server\'s internet connection.');
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const detail = data?.error?.message || res.statusText;
    console.error(`Groq error ${res.status}: ${detail}`); // the real reason shows in the server log
    if (res.status >= 500 && attempt < 1) {
      await sleep(1500);
      return callGroq(system, messages, attempt + 1);
    }
    if (res.status === 429) throw new ApiError(429, 'The assistant is busy (rate limit reached). Please try again in a minute.');
    if (res.status === 413) throw new ApiError(503, 'The assistant request was too large. Ask the admin to lower AI_CONTEXT_CHARS.');
    if (res.status === 401 || res.status === 403) throw new ApiError(503, 'The AI assistant is not configured correctly (check GROQ_API_KEY)');
    if (res.status === 404 || /model/i.test(detail)) throw new ApiError(503, `The Groq model "${config.groqModel}" is unavailable. Groq retires models often; pick a current one from console.groq.com/docs/models and set GROQ_MODEL.`);
    throw new ApiError(502, 'The assistant is temporarily unavailable');
  }

  // Some models (e.g. Qwen) put their reasoning in <think> tags; never show that to students.
  const text = (data.choices?.[0]?.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (!text) {
    console.warn('Groq returned no text:', data.choices?.[0]?.finish_reason);
    return 'Sorry, I could not answer that. Try rephrasing your question.';
  }
  return text;
}

const callModel = (system, messages) =>
  config.aiProvider === 'gemini' ? callGemini(system, messages) : callGroq(system, messages);

/* ---------- Document context ---------- */

const STOP = new Set('the a an and or of to in on for is are was be with at by from this that it as how what where when who which do i my me can you your'.split(' '));
const tokenize = (s) => (s.toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter((w) => !STOP.has(w));
const compact = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
// Keep line breaks (timetable rows!) but drop runs of spaces and blank lines.
const tidy = (t) => t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

// Timetables and calendars are answered exactly, so the assistant always receives their full text.
const FULL_TEXT_SECTIONS = ['tt', 'cal'];
const FULL_TEXT_LIMIT = Math.floor(config.aiContextChars * 0.4); // per document; free tiers cap tokens per minute

function fullDocuments() {
  const marks = FULL_TEXT_SECTIONS.map(() => '?').join(',');
  return db
    .prepare(`SELECT title, course_code, text_content FROM files WHERE section IN (${marks}) AND text_content IS NOT NULL ORDER BY updated_at DESC LIMIT 2`)
    .all(...FULL_TEXT_SECTIONS)
    .map((d) => `[Document: "${d.title}"${d.course_code ? ` (${d.course_code})` : ''}]\n${tidy(d.text_content).slice(0, FULL_TEXT_LIMIT)}`);
}

// Keyword retrieval for everything else (notes, question papers...). Swap for embeddings at scale.
function retrieve(query, limit = 3) {
  const terms = new Set(tokenize(query));
  const qc = compact(query);
  if (!terms.size && !qc) return [];
  const marks = FULL_TEXT_SECTIONS.map(() => '?').join(',');
  const docs = db
    .prepare(`SELECT title, course_code, course_name, text_content FROM files WHERE text_content IS NOT NULL AND section NOT IN (${marks})`)
    .all(...FULL_TEXT_SECTIONS);
  const scored = [];
  for (const doc of docs) {
    const text = tidy(doc.text_content).slice(0, 60_000);
    const codeHit = doc.course_code && qc.includes(compact(doc.course_code)) ? 5 : 0; // student mentioned the course code
    for (let i = 0; i < text.length; i += 1000) {
      const chunk = text.slice(i, i + 1200);
      const overlap = tokenize(chunk).reduce((n, w) => n + (terms.has(w) ? 1 : 0), 0);
      const score = overlap + codeHit;
      if (score > 0) scored.push({ title: doc.title, code: doc.course_code, chunk, score });
    }
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

function buildSystem(user, passages, fullDocs) {
  const rows = db
    .prepare('SELECT section, title, course_code, (text_content IS NOT NULL AND length(text_content) > 50) AS indexed FROM files ORDER BY updated_at DESC')
    .all();
  const catalogue = SECTIONS.map((s) => {
    const items = rows
      .filter((r) => r.section === s.key)
      .map((r) => `${r.title}${r.course_code ? ` [${r.course_code}]` : ''}${r.indexed ? '' : ' (text not readable by assistant)'}`);
    return `- ${s.label}: ${items.length ? items.join('; ') : '(nothing published yet)'}`;
  }).join('\n');

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: config.timezone });
  const excerpts = passages.length
    ? passages.map((p, i) => `[Excerpt ${i + 1} from "${p.title}"${p.code ? ` (${p.code})` : ''}]\n${p.chunk}`).join('\n\n')
    : '(no relevant excerpts found)';

  const classes = listClasses();
  const cls = normClass(user.program);
  const structured = cls ? timetableText(cls) : null;
  const timetableBlock = user.role === 'student'
    ? structured
      ? `Class timetable for ${cls} (structured and authoritative). Periods: ${PERIODS.map((p) => `P${p.no} ${p.start}-${p.end}`).join(', ')}; free period ${BREAK.start}-${BREAK.end} every day.\n${structured}`
      : classes.length
        ? `This student has no class set, or no timetable exists for it. Timetables exist for: ${classes.join(', ')}.`
        : '(no structured timetable published)'
    : classes.length ? `Timetables exist for classes: ${classes.join(', ')}.` : '(no structured timetable published)';
  const nowTime = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: config.timezone });

  let attendanceText = 'Not applicable.';
  if (user.role === 'student') {
    const att = studentSummary(user.id);
    attendanceText = att.courses.length
      ? `Minimum required: ${att.min}%. Overall: ${att.overall.total ? `${att.overall.percent}% (${att.overall.present}/${att.overall.total} classes)` : 'no classes held yet'}.\n` +
        att.courses.map((c) => `- ${c.code} ${c.name}: ${c.total ? `${c.present}/${c.total} classes attended (${c.percent}%)` : 'no classes held yet'}${c.shortage ? `, BELOW the minimum, needs the next ${c.needed} classes` : c.total ? `, can still miss ${c.can_miss}` : ''}`).join('\n')
      : 'The student is not enrolled in any course yet.';
  }

  return [
    'You are the Campus Assistant inside collegeHub.',
    'Be concise, friendly and accurate. Only help with this portal and its published content; politely decline anything else.',
    "Never invent dates, times, rooms, fees, rules or files. If the answer isn't in the material below, say so and suggest contacting the admin office.",
    'When you use a document, mention its title. For timetable questions give the exact day, time, subject and room as written, and say which timetable you used.',
    'If a needed document is marked "text not readable by assistant", tell the student to open it from the portal instead.',
    'Study material lives in the Library page, where students can search by course code. Timetables are under My Timetable.',
    `Today is ${today}. Current time: ${nowTime}.`,
    'For timetable questions use the structured class timetable first and answer with day, period, time, subject, group, teacher and room. For "next class" use today\'s day and the current time.',
    `Timetable:\n${timetableBlock}`,
    `User: ${user.name} (${user.role}).`,
    'For attendance questions use ONLY the live attendance data below. If overall or any course is BELOW the minimum, say so plainly, name the courses, and give the exact number of classes needed; never say it is fine when it is below the minimum. The full report is under Class Attendance.',
    `Attendance (live data):\n${attendanceText}`,
    `Thought of the day: "${getThought()}"`,
    `Published sections and items:\n${catalogue}`,
    `Timetable and calendar documents (full text):\n${fullDocs.length ? fullDocs.join('\n\n') : '(none published or readable)'}`,
    `Relevant excerpts from other documents:\n${excerpts}`,
    user.role === 'admin'
      ? 'Admins can mark class attendance and view reports under Attendance manager. Admins can publish files/links to sections (with a course code), replace or delete items, register students and edit the thought of the day.'
      : 'Students open items from section cards; items tagged NEW were added in the last 7 days.',
  ].join('\n\n');
}

export async function askAssistant(user, messages) {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user')?.content ?? '';
  const isStudent = user.role === 'student';

  // Exact figures straight from the database: instant, free and independent of the AI provider.
  if (isStudent && isAttendanceOnly(lastUser)) return attendanceAnswer(studentSummary(user.id), user.name);

  const system = buildSystem(user, retrieve(lastUser), fullDocuments());
  try {
    return await callModel(system, messages);
  } catch (err) {
    // The AI is down or busy, but an attendance question can still be answered from live data.
    if (isStudent && isAttendanceQuestion(lastUser)) {
      return `${attendanceAnswer(studentSummary(user.id), user.name)}\n\n(The AI assistant is busy, so this is shown directly from your attendance record.)`;
    }
    if (err instanceof ApiError) throw err;
    console.error('Assistant request failed:', err.message);
    throw new ApiError(502, 'The assistant is temporarily unavailable');
  }
}
