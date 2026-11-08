export const SECTIONS = Object.freeze([
  { key: 'news', label: 'News & Notices' },
  { key: 'cal', label: 'Academic Calendar' },
  { key: 'prereg', label: 'Semester Pre-registration' },
  { key: 'tt', label: 'My Timetable' },
  { key: 'att', label: 'Class Attendance' },
  { key: 'fee', label: 'Fee & Dues' },
  { key: 'exam', label: 'Examinations' },
  { key: 'fb', label: 'Feedback' },
  { key: 'qp', label: 'Question Papers' },
  { key: 'notes', label: 'Lecture Notes' },
  { key: 'lib', label: 'Library' },
  { key: 'ccgd', label: 'CCG & D News' },
  { key: 'sch', label: 'Scholarship' },
  { key: 'doc', label: 'Student Documents' },
]);
export const SECTION_KEYS = SECTIONS.map((s) => s.key);
export const ROLES = Object.freeze({ ADMIN: 'admin', STUDENT: 'student' });

// Weekly timetable layout (24-hour times). The break is shown after period `after`.
export const DAYS = Object.freeze(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
export const PERIODS = Object.freeze([
  { no: 1, start: '09:00', end: '09:50' },
  { no: 2, start: '09:50', end: '10:40' },
  { no: 3, start: '10:40', end: '11:30' },
  { no: 4, start: '11:30', end: '12:20' },
  { no: 5, start: '12:40', end: '13:30' },
  { no: 6, start: '13:30', end: '14:20' },
  { no: 7, start: '14:20', end: '15:10' },
  { no: 8, start: '15:10', end: '16:00' },
]);
export const BREAK = Object.freeze({ after: 4, label: 'Free Period', start: '12:20', end: '12:40' });
