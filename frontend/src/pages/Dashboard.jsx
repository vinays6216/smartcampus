import { Link } from 'react-router-dom';
import { get } from '../api/client';
import useFetch from '../hooks/useFetch';
import { useAuth } from '../context/AuthContext';
import { Async, Badge, Empty, PageHeader, StatCard } from '../components/ui';
import { fmtDateTime, timeLeft } from '../utils/format';

// Student only: assignment alerts (due within 24 h + overdue) and latest announcements
function StudentExtras() {
  const alerts = useFetch(() => get('/assignments/student/alerts'), []);
  const news = useFetch(() => get('/announcements', { limit: 4 }), []);
  const dueSoon = alerts.data?.dueSoon || [];
  const overdue = alerts.data?.overdue || [];

  return (
    <div className="grid-2">
      <div className="card">
        <h2>Assignment alerts</h2>
        <Async f={alerts}>
          {!dueSoon.length && !overdue.length && <Empty>No pending deadlines. You are all caught up.</Empty>}
          {[...dueSoon, ...overdue].map((a) => (
            <div key={a.assignmentId} className="list-item row">
              <div>
                <Link to={`/assignments/${a.assignmentId}`}><strong>{a.title}</strong></Link>
                <div className="muted">{a.subjectName} - due {fmtDateTime(a.deadline)}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <Badge value={a.displayStatus} />
                <div className="muted">{timeLeft(a.deadline)}</div>
              </div>
            </div>
          ))}
        </Async>
      </div>
      <div className="card">
        <h2>Latest announcements</h2>
        <Async f={news}>
          {!news.data?.length && <Empty>No announcements.</Empty>}
          {news.data?.map((n) => (
            <div key={n.id} className="list-item">
              <div className="row"><strong>{n.title}</strong><Badge value={n.priority} /></div>
              <div className="muted">{n.authorName} - {fmtDateTime(n.publishAt)}</div>
            </div>
          ))}
          <Link to="/announcements">View all</Link>
        </Async>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const f = useFetch(() => get('/dashboard'), []);
  const d = f.data || {};

  return (
    <>
      <PageHeader title={`Welcome, ${user.fullName}`} subtitle={`Signed in as ${user.role}`} />
      <Async f={f}>
        {user.role === 'student' && (
          <>
            <div className="grid">
              <StatCard label="Overall attendance" value={d.attendance?.overallPercentage != null ? `${d.attendance.overallPercentage}%` : '-'}
                tone={d.attendance?.overallPercentage < d.attendance?.minRequiredPercent ? 'red' : 'green'} to="/attendance" />
              <StatCard label={`Subjects below ${d.attendance?.minRequiredPercent}%`} value={d.attendance?.subjectsBelowMinimum}
                tone={d.attendance?.subjectsBelowMinimum ? 'red' : 'green'} to="/attendance" />
              <StatCard label="Pending assignments" value={d.assignments?.pending} to="/assignments" />
              <StatCard label="Due soon (24 h)" value={d.assignments?.dueSoon} tone="amber" to="/assignments" />
              <StatCard label="Overdue" value={d.assignments?.overdue} tone="red" to="/assignments" />
              <StatCard label="Submitted" value={d.assignments?.submitted} tone="green" to="/assignments" />
              <StatCard label="Open attendance issues" value={d.openIssues} tone="amber" to="/attendance" />
              <StatCard label="Unread alerts" value={d.unreadNotifications} to="/notifications" />
            </div>
            <StudentExtras />
          </>
        )}

        {user.role === 'lecturer' && (
          <div className="grid">
            <StatCard label="My classes" value={d.classes} to="/mark-attendance" />
            <StatCard label="Open attendance issues" value={d.openIssues} tone="amber" to="/attendance-issues" />
            <StatCard label="Published assignments" value={d.publishedAssignments} to="/manage-assignments" />
            <StatCard label="Awaiting grading" value={d.awaitingGrading} tone="red" to="/manage-assignments" />
            <StatCard label="Unread alerts" value={d.unreadNotifications} to="/notifications" />
          </div>
        )}

        {user.role === 'admin' && (
          <div className="grid">
            <StatCard label="Active students" value={d.activeStudents} to="/students" />
            <StatCard label="Active lecturers" value={d.activeLecturers} to="/lecturers" />
            <StatCard label="Published assignments" value={d.publishedAssignments} to="/manage-assignments" />
            <StatCard label="Open attendance issues" value={d.openAttendanceIssues} tone="amber" to="/attendance-issues" />
            <StatCard label="Unread alerts" value={d.unreadNotifications} to="/notifications" />
          </div>
        )}
      </Async>
    </>
  );
}
