import { Link } from 'react-router-dom';
import { AlarmClock, AlertTriangle, CalendarClock, CheckCircle2, Clock } from 'lucide-react';
import { get } from '../api/client';
import useFetch from '../hooks/useFetch';
import { Async, Badge, Empty } from './ui';
import { fmtDateTime, fmtTime, timeLeft } from '../utils/format';

const DAY = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const nowHHMM = () => new Date().toTimeString().slice(0, 5);

// Dashboard "Today" panel. Student: classes today + own mark, next deadline, attendance warnings.
// Lecturer: own classes today with "Mark" / "Marked".
export default function TodayPanel({ role }) {
  const f = useFetch(() => get('/dashboard/today'), []);
  const d = f.data || {};
  const now = nowHHMM();

  const classes = (
    <div className="card today-card">
      <h2><CalendarClock size={18} /> Today · {DAY[d.dayOfWeek] || ''}</h2>
      <Async f={f}>
        {!d.classes?.length && <Empty>No classes on the timetable today.</Empty>}
        {d.classes?.map((c) => {
          const live = fmtTime(c.startTime) <= now && now < fmtTime(c.endTime);
          const done = fmtTime(c.endTime) <= now;
          return (
            <div key={c.id} className={`today-row ${live ? 'live' : ''} ${done ? 'done' : ''}`}>
              <div className="today-time">{fmtTime(c.startTime)}<span>{fmtTime(c.endTime)}</span></div>
              <div className="today-what">
                <strong>{c.subjectCode} · {c.subjectName}</strong>
                <div className="muted">
                  P{c.periodNo}{c.room ? ` · ${c.room}` : ''}
                  {role === 'student' ? ` · ${c.lecturerName}` : ` · ${c.programCode} S${c.semesterNo} ${c.sectionName}`}
                </div>
              </div>
              <div className="today-state">
                {live && <span className="live-dot">Now</span>}
                {role === 'student' && (c.myStatus ? <Badge value={c.myStatus} /> : <span className="muted">{done ? 'not marked yet' : ''}</span>)}
                {role === 'lecturer' && (c.sessionId
                  ? <span className="text-green"><CheckCircle2 size={14} /> Marked</span>
                  : <Link className="btn btn-sm btn-primary" to="/mark-attendance">Mark</Link>)}
              </div>
            </div>
          );
        })}
      </Async>
    </div>
  );

  if (role !== 'student') return classes;

  return (
    <div className="today-grid">
      {classes}
      <div className="today-side">
        <div className="card">
          <h2><AlarmClock size={18} /> Next deadline</h2>
          <Async f={f}>
            {!d.nextDeadline && <Empty>Nothing due. You're all caught up.</Empty>}
            {d.nextDeadline && (
              <Link to={`/assignments/${d.nextDeadline.id}`} className="next-deadline">
                <strong>{d.nextDeadline.title}</strong>
                <span className="muted">{d.nextDeadline.subjectName}</span>
                <span className="deadline-left"><Clock size={14} /> {timeLeft(d.nextDeadline.deadline)} · {fmtDateTime(d.nextDeadline.deadline)}</span>
              </Link>
            )}
          </Async>
        </div>
        <div className="card">
          <h2><AlertTriangle size={18} /> Attendance warnings</h2>
          <Async f={f}>
            {!d.warnings?.length && <Empty>All subjects are at or above {d.minRequiredPercent ?? 75}%.</Empty>}
            {d.warnings?.map((w) => (
              <Link key={w.subjectCode} to="/attendance" className="warn-row">
                <span><strong>{w.subjectCode}</strong> <span className="muted">{w.subjectName}</span></span>
                <span className="text-red">{Number(w.attendancePercentage)}% · attend next {w.classesToReach}</span>
              </Link>
            ))}
          </Async>
        </div>
      </div>
    </div>
  );
}
