import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { get } from '../api/client';

const MENUS = {
  student: [
    ['/', '📊', 'Dashboard'], ['/profile', '👤', 'My Profile'], ['/attendance', '📋', 'Attendance'], ['/assignments', '📝', 'Assignments'], ['/timetable', '🗓️', 'Time Table'],
    ['/materials', '📚', 'Study Materials'], ['/announcements', '📢', 'Announcements'], ['/calendar', '📅', 'Calendar'],
  ],
  lecturer: [
    ['/', '📊', 'Dashboard'], ['/mark-attendance', '✅', 'Mark Attendance'], ['/attendance-report', '📈', 'Attendance Report'],
    ['/attendance-issues', '⚠️', 'Attendance Issues'], ['/attendance-corrections', '🧾', 'Corrections Log'], ['/manage-assignments', '📝', 'Assignments'], ['/timetable', '🗓️', 'Time Table'],
    ['/materials', '📚', 'Study Materials'], ['/announcements', '📢', 'Announcements'], ['/calendar', '📅', 'Calendar'],
  ],
  admin: [
    ['/', '📊', 'Dashboard'], ['/students', '🎓', 'Students'], ['/lecturers', '👨‍🏫', 'Lecturers'], ['/academic', '🏛️', 'Academic Setup'],
    ['/teaching', '📋', 'Teaching Assignments'], ['/timetable', '🗓️', 'Time Tables'], ['/manage-assignments', '📝', 'Assignments'],
    ['/attendance-report', '📈', 'Attendance Report'], ['/attendance-issues', '⚠️', 'Attendance Issues'], ['/attendance-corrections', '🧾', 'Corrections Log'],
    ['/materials', '📚', 'Study Materials'], ['/announcements', '📢', 'Announcements'], ['/calendar', '📅', 'Calendar'],
  ],
};

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  // bell badge: refresh every minute and on every page change
  useEffect(() => {
    let alive = true;
    const load = () => get('/notifications/unread-count').then((b) => alive && setUnread(b.data.count)).catch(() => {});
    load();
    const timer = setInterval(load, 60000);
    return () => { alive = false; clearInterval(timer); };
  }, [location.pathname]);

  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className={`shell theme-${user.role}`}>
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">🎓 Smart Campus</div>
        <nav>
          {MENUS[user.role].map(([to, icon, text]) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}><span className="nav-icon">{icon}</span>{text}</NavLink>
          ))}
        </nav>
      </aside>
      {open && <div className="backdrop" onClick={() => setOpen(false)} />}

      <div className="main">
        <header className="topbar">
          <button className="btn-icon menu-btn" onClick={() => setOpen(!open)} aria-label="Menu">☰</button>
          <div className="spacer" />
          <Link to="/notifications" className="bell" title="Notifications">
            🔔{unread > 0 && <span className="bell-count">{unread}</span>}
          </Link>
          {user.role === 'student' ? (
            <Link to="/profile" className="user-chip" title="View & Edit Profile" style={{ textDecoration: 'none', color: 'inherit' }}>
              <strong>{user.fullName}</strong>
              <span className="role-badge">{user.role}</span>
            </Link>
          ) : (
            <div className="user-chip">
              <strong>{user.fullName}</strong>
              <span className="role-badge">{user.role}</span>
            </div>
          )}
          <Link to="/change-password" className="btn btn-sm">Password</Link>
          <button className="btn btn-sm" onClick={logout}>Logout</button>
        </header>
        <main className="content"><Outlet /></main>
      </div>
    </div>
  );
}
