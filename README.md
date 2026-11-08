# collegeHub

Express + SQLite (Node's built-in `node:sqlite`, so no compiler is needed) REST API and web app for collegeHub: role-based authentication (admin / student), file and link management with PDF text extraction, and an AI assistant (Groq by default when `GROQ_API_KEY` is set; Gemini optional) that answers from the published content.

## Quick start

```bash
npm install
cp .env.example .env        # set JWT_SECRET, ADMIN_PASSWORD, GROQ_API_KEY
npm run seed:admin          # creates the first admin account
npm run dev                 # http://localhost:4000
```

Docker: `docker build -t portal-api . && docker run -p 4000:4000 --env-file .env -v portal-data:/app/data -v portal-uploads:/app/uploads portal-api`

## API

All routes are under `/api`. Authenticated routes need `Authorization: Bearer <token>`.

| Method | Route | Role | Purpose |
|---|---|---|---|
| POST | `/auth/login` | public | `{enrollment, password}` returns `{token, user}` (admins use the same endpoint) |
| GET | `/auth/me` | any | Current user |
| POST | `/auth/change-password` | any | `{currentPassword, newPassword}` |
| GET | `/students` | admin | List students |
| POST | `/students` | admin | Create student, or reset password if the enrollment exists |
| DELETE | `/students/:id` | admin | Remove student (access ends immediately) |
| GET | `/files?section=&q=` | any | List files and links |
| GET | `/files/:id/view` | any | Preview a PDF/image/text file inline (opens inside the site) |
| GET | `/files/:id/download` | any | Download a file (links redirect) |
| POST | `/files` | admin | Multipart: `section`, `title`, optional `course_code` / `course_name`, and `file` or `url` |
| PUT | `/files/:id` | admin | Edit title/section, or replace the file (multipart `file`) |
| DELETE | `/files/:id` | admin | Delete file and its stored copy |
| GET / PUT | `/settings/thought` | any / admin | Thought of the Day |
| POST | `/assistant/chat` | any | `{messages:[{role,content}]}` returns `{reply}` |
| GET | `/attendance/me` | student | Own overall and per-course attendance (percent, shortage, classes needed, classes that can be missed) |
| GET | `/attendance/me/records?course_id=` | student | Date-wise records for one course |
| GET / POST / DELETE | `/courses` | any / admin | List courses; create or rename; delete (cascades attendance) |
| GET / PUT | `/courses/:id/students` | admin | View or replace a class roster (enrollment numbers) |
| GET | `/attendance/sheet?course_id=&date=&period=` | admin | Class list with any saved marks |
| POST | `/attendance/mark` | admin | Save or correct one class (every enrolled student must be included; no future dates) |
| GET / DELETE | `/attendance/sessions` | admin | Recorded classes; delete one |
| GET | `/attendance/report?course_id=` | admin | Per-student report for a course |
| GET | `/attendance/report.csv?course_id=` | admin | Same report as CSV |
| GET | `/timetable?class=` | any | Weekly timetable (days, periods, break, entries). Students default to their own class |
| POST / PUT / DELETE | `/timetable`, `/timetable/:id` | admin | Add, edit or delete one entry; `DELETE /timetable?class=` clears a class |
| POST | `/timetable/import` | admin | Bulk import CSV / pasted spreadsheet rows (`replace` or `append`; all-or-nothing) |
| GET | `/health` | public | Liveness check |

Sections: `news cal prereg tt att fee exam fb qp notes lib ccgd sch doc`. Notes, Question Papers and Library appear together on the Library page, grouped and searchable by course code. (see `src/constants.js`).

## AI assistant

Uses the Groq API (free tier, OpenAI-compatible). Create a key at https://console.groq.com/keys and set `GROQ_API_KEY` in `.env`; optionally `GROQ_MODEL` (default `openai/gpt-oss-120b`). Set `AI_PROVIDER=gemini` with `GEMINI_API_KEY` to use Google Gemini instead. Free tiers are rate-limited, so avoid sending private student data you would not want a third party to process. If you hit token-per-minute limits, lower `AI_CONTEXT_CHARS` (default 12000).

**Attendance questions** from students ("Is my attendance okay?", "how many classes can I miss?") are answered directly from the live database figures without calling the AI, so they are exact and still work when the AI provider is down. Mixed questions go to the AI, and if it fails the attendance figures are still returned. Real error causes (rate limit, bad key, wrong model) are written to the server log.

## Timetable

Timetables are stored as data (not just PDFs). Each student has a **class / program** (e.g. `DSAI-C`, set when registering them), and sees that class's weekly grid (days × periods, with the free period) and a "Today" view that highlights the current period. Admins add entries one by one or paste rows from a spreadsheet (`Day, Period, Course code, Group, Teacher, Room`). A ready-made example is in `samples/timetable-DSAI-C.csv`. Period times and the break are set in `src/constants.js`. The AI assistant answers "what's my next class?" style questions from this data.

## Attendance

Admins create courses, enrol students (by enrollment number), then mark each class as Present/Absent for a date and period; marking the same class again corrects it. Students see a cumulative report (held, present, absent, percentage, shortage status and how many classes they must attend to reach the minimum) and a date-wise list per course. The minimum is `ATTENDANCE_MIN` (default 75). Reports can be printed, and admins can export CSV. The AI assistant can answer a student's attendance questions from the live figures.

## Timetable and the assistant

Timetable (`tt`) and calendar (`cal`) PDFs are given to the assistant in full, so it can answer day/time/room questions. Other documents are searched by relevance and by course code. Scanned images contain no text, so upload text-based PDFs; the admin sees a warning when a file isn't readable.

## Design notes

- **Security:** bcrypt (cost 12), JWT with per-request user re-check, constant-time login path, Helmet, CORS allow-list, rate limits (global, login, assistant), Zod validation, extension allow-list, random stored filenames, files served only through authenticated routes.
- **Assistant:** at upload, PDF/TXT/CSV text is extracted and stored. On each question the service retrieves the most relevant passages and gives Claude the section catalogue plus those excerpts, so it answers from real documents. For a large corpus, replace `retrieve()` in `src/services/ai.js` with embeddings and a vector index.
- **Scaling:** SQLite suits a single instance. For multiple instances, move to PostgreSQL and S3-compatible storage.
- **Not included:** refresh tokens, email password reset, audit log. Add these before production use.

## Frontend

A framework-free frontend lives in `public/` and is served by the API itself, so after `npm run dev` just open http://localhost:4000. It covers the welcome screen, student and admin login, section cards with NEW tags, admin content/student/thought management and the assistant widget. Tokens are kept in `sessionStorage` (cleared when the tab closes).

## Tests

`npm test` runs integration tests (Node's built-in test runner, no extra dependencies) against an isolated temporary database: auth, role enforcement, student management, uploads and downloads, validation, the Thought of the Day, assistant guard rails and immediate access revocation. The AI provider call is not exercised by tests (provider keys are blanked); attendance answers are.

## Connecting a different frontend

Replace the portal's database calls with `fetch` calls to these routes, store the token in memory (or an httpOnly cookie if you add cookie auth), and point the chat widget at `POST /api/assistant/chat`.
