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
  // 4th item = permission the admin needs to see the entry ('platform' = platform admins only)
  admin: [
    ['/', '📊', 'Dashboard'], ['/platform', '🛡️', 'Platform Admins', 'platform'],
    ['/students', '🎓', 'Students', 'users'], ['/lecturers', '👨‍🏫', 'Lecturers', 'users'], ['/academic', '🏛️', 'Academic Setup', 'academic'],
    ['/teaching', '📋', 'Teaching Assignments', 'academic'], ['/timetable', '🗓️', 'Time Tables'], ['/manage-assignments', '📝', 'Assignments', 'assignments'],
    ['/attendance-report', '📈', 'Attendance Report', 'attendance'], ['/attendance-issues', '⚠️', 'Attendance Issues', 'attendance'],
    ['/attendance-corrections', '🧾', 'Corrections Log', 'attendance'],
    ['/materials', '📚', 'Study Materials'], ['/announcements', '📢', 'Announcements'], ['/calendar', '📅', 'Calendar'],
  ],
};

// Admin menu entries the signed-in admin may use. Without permission info (old session) everything is shown.
function allowed(user, need) {
  if (user.role !== 'admin' || !need) return true;
  if (need === 'platform') return !!user.isPlatformAdmin;
  return !Array.isArray(user.permissions) || user.permissions.includes(need);
}

export default function Layout() {
  const { user, logout, updateUser } = useAuth();
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

  // refresh the admin's permissions (a platform admin may have changed them)
  useEffect(() => {
    if (user.role !== 'admin') return;
    get('/auth/me').then((b) => updateUser({ isPlatformAdmin: !!b.data.isPlatformAdmin, permissions: b.data.permissions })).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  return (
    <div className={`shell theme-${user.role}`}>
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">🎓 Smart Campus</div>
        <nav>
          {MENUS[user.role].filter((m) => allowed(user, m[3])).map(([to, icon, text]) => (
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
              <span className="role-badge">{user.isPlatformAdmin ? 'platform admin' : user.role}</span>
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
