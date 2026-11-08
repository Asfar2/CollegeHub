/**
 * Answers a student's attendance questions straight from the live figures, with no AI call.
 * This keeps the answer exact (and available) even when the AI provider is slow, rate-limited or down.
 * Pure functions only: they take the object returned by studentSummary().
 */

const ATTENDANCE_WORDS = /\b(attendance|attend|attended|absent|absence|present|shortage|detain(ed)?|bunk|short of|percentage|percent|eligible|eligibility)\b|\bmiss(ed)?\b.*\bclass(es)?\b|\bclass(es)?\b.*\bmiss(ed)?\b|\bhow many\b.*\b(skip|leave|miss)\b|\b75\b/i;
// If the question is also about something else, let the AI handle it (and use this as the fallback).
const OTHER_TOPICS = /\b(timetable|schedule|next class|today|tomorrow|room|teacher|notes?|paper|fees?|exam|calendar|library|scholarship)\b/i;

export const isAttendanceQuestion = (text) => ATTENDANCE_WORDS.test(String(text ?? ''));
export const isAttendanceOnly = (text) => isAttendanceQuestion(text) && !OTHER_TOPICS.test(String(text ?? ''));

const n = (count) => `${count} class${count === 1 ? '' : 'es'}`;

function courseLine(c, min) {
  if (!c.total) return `- ${c.code} ${c.name}: no classes held yet`;
  const head = `- ${c.code} ${c.name}: ${c.percent}% (${c.present}/${c.total})`;
  if (c.shortage) return `${head} - below ${min}%, attend the next ${n(c.needed)} in a row to reach ${min}%`;
  return `${head} - OK${c.can_miss ? `, you can still miss ${n(c.can_miss)}` : ', but you cannot afford to miss the next class'}`;
}

export function attendanceAnswer(summary, name = '') {
  const { min, overall, courses } = summary;
  const hi = name ? `${name.split(' ')[0]}, ` : '';
  if (!courses.length) {
    return 'You are not enrolled in any course yet, so there is no attendance to show. Please ask the admin office to add you to your courses.';
  }
  if (!overall.total) {
    return `No classes have been recorded for your courses yet, so there is no attendance to report. The minimum required is ${min}%.`;
  }

  const low = courses.filter((c) => c.shortage);
  const lines = [];
  if (overall.shortage) {
    lines.push(`${hi}your overall attendance is ${overall.percent}% (${overall.present}/${overall.total} classes), which is below the required ${min}%. You need to attend the next ${n(overall.needed)} in a row to get back to ${min}%.`);
  } else {
    lines.push(`${hi}your overall attendance is ${overall.percent}% (${overall.present}/${overall.total} classes), which meets the required ${min}%.${overall.can_miss ? ` You can still miss ${n(overall.can_miss)} overall and stay at or above ${min}%.` : ''}`);
  }
  if (low.length) {
    lines.push(`Courses below ${min}%: ${low.map((c) => c.code).join(', ')}. Focus on these first.`);
  }
  lines.push('Course-wise:\n' + courses.map((c) => courseLine(c, min)).join('\n'));
  lines.push('Open Class Attendance in the portal for the date-wise record of every class.');
  return lines.join('\n\n');
}
