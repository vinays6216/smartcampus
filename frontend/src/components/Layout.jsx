import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle, Award, Bell, CalendarOff, History, BookOpen, Building2, CalendarDays, CalendarRange, ChevronDown, ClipboardCheck, ClipboardList,
  FileText, GraduationCap, KeyRound, LayoutDashboard, LineChart, LogOut, Megaphone, Menu, ReceiptText, ShieldCheck,
  UserRound, UsersRound,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { get } from '../api/client';
import ThemeToggle from './ThemeToggle';

// Grouped menus, CampusPulse style. Item: [path, Icon, label, admin permission needed ('platform' = platform admins only)]
const MENUS = {
  student: [
    ['Overview', [['/', LayoutDashboard, 'Dashboard'], ['/profile', UserRound, 'My Profile']]],
    ['Academics', [['/attendance', ClipboardCheck, 'Attendance'], ['/leave', CalendarOff, 'Leave'], ['/assignments', FileText, 'Assignments'], ['/my-marks', Award, 'My Marks'],
      ['/timetable', CalendarRange, 'Time Table'], ['/materials', BookOpen, 'Study Materials']]],
    ['Campus', [['/announcements', Megaphone, 'Announcements'], ['/calendar', CalendarDays, 'Calendar']]],
  ],
  lecturer: [
    ['Overview', [['/', LayoutDashboard, 'Dashboard']]],
    ['Attendance', [['/mark-attendance', ClipboardCheck, 'Mark Attendance'], ['/attendance-report', LineChart, 'Attendance Report'],
      ['/attendance-issues', AlertTriangle, 'Attendance Issues'], ['/leave-requests', CalendarOff, 'Leave Requests'],
      ['/attendance-corrections', ReceiptText, 'Corrections Log']]],
    ['Teaching', [['/manage-assignments', FileText, 'Assignments'], ['/marks', Award, 'Internal Marks'], ['/timetable', CalendarRange, 'Time Table'], ['/materials', BookOpen, 'Study Materials']]],
    ['Campus', [['/announcements', Megaphone, 'Announcements'], ['/calendar', CalendarDays, 'Calendar']]],
  ],
  admin: [
    ['Overview', [['/', LayoutDashboard, 'Dashboard'], ['/platform', ShieldCheck, 'Platform Admins', 'platform'], ['/activity', History, 'Activity Log', 'platform']]],
    ['People', [['/students', GraduationCap, 'Students', 'users'], ['/lecturers', UsersRound, 'Lecturers', 'users']]],
    ['Academics', [['/academic', Building2, 'Academic Setup', 'academic'], ['/teaching', ClipboardList, 'Teaching Assignments', 'academic'],
      ['/timetable', CalendarRange, 'Time Tables'], ['/manage-assignments', FileText, 'Assignments', 'assignments'], ['/marks', Award, 'Internal Marks', 'assignments'], ['/materials', BookOpen, 'Study Materials']]],
    ['Attendance', [['/attendance-report', LineChart, 'Attendance Report', 'attendance'], ['/attendance-issues', AlertTriangle, 'Attendance Issues', 'attendance'],
      ['/leave-requests', CalendarOff, 'Leave Requests', 'attendance'], ['/attendance-corrections', ReceiptText, 'Corrections Log', 'attendance']]],
    ['Campus', [['/announcements', Megaphone, 'Announcements'], ['/calendar', CalendarDays, 'Calendar']]],
  ],
};
const EXTRA_TITLES = { '/notifications': 'Notifications', '/change-password': 'Change password' };

// Admin menu entries the signed-in admin may use. Without permission info (old session) everything is shown.
function allowed(user, need) {
  if (user.role !== 'admin' || !need) return true;
  if (need === 'platform') return !!user.isPlatformAdmin;
  return !Array.isArray(user.permissions) || user.permissions.includes(need);
}

const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';

export default function Layout() {
  const { user, logout, updateUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const menuRef = useRef(null);

  // bell badge: refresh every minute and on every page change
  useEffect(() => {
    let alive = true;
    const load = () => get('/notifications/unread-count').then((b) => alive && setUnread(b.data.count)).catch(() => {});
    load();
    const timer = setInterval(load, 60000);
    return () => { alive = false; clearInterval(timer); };
  }, [location.pathname]);

  useEffect(() => { setOpen(false); setMenuOpen(false); }, [location.pathname]);

  // refresh the admin's permissions (a platform admin may have changed them)
  useEffect(() => {
    if (user.role !== 'admin') return;
    get('/auth/me').then((b) => updateUser({ isPlatformAdmin: !!b.data.isPlatformAdmin, permissions: b.data.permissions })).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // close the user menu on an outside click
  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const groups = MENUS[user.role]
    .map(([title, items]) => [title, items.filter((m) => allowed(user, m[3]))])
    .filter(([, items]) => items.length);
  const current = groups.flatMap(([g, items]) => items.map((m) => [g, m]))
    .find(([, [to]]) => (to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)));
  const roleLabel = user.isPlatformAdmin ? 'Platform admin' : user.role[0].toUpperCase() + user.role.slice(1);

  return (
    <div className={`shell theme-${user.role}`}>
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <span className="brand-mark"><GraduationCap size={18} /></span>
          <span><strong>Smart Campus</strong><small>{roleLabel} workspace</small></span>
        </div>
        <nav>
          {groups.map(([title, items]) => (
            <div className="nav-group" key={title}>
              <p className="nav-title">{title}</p>
              {items.map(([to, Icon, text]) => (
                <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
                  <Icon size={17} className="nav-icon" />{text}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      {open && <div className="backdrop" onClick={() => setOpen(false)} />}

      <div className="main">
        <header className="topbar">
          <button className="btn-icon menu-btn" onClick={() => setOpen(!open)} aria-label="Menu"><Menu size={18} /></button>
          <div className="topbar-title">
            {current ? <><span className="crumb">{current[0]}</span><span className="crumb-sep">/</span><strong>{current[1][2]}</strong></>
              : <strong>{EXTRA_TITLES[location.pathname] || 'Smart Campus'}</strong>}
          </div>
          <div className="spacer" />
          <ThemeToggle />
          <Link to="/notifications" className="bell" title="Notifications" aria-label="Notifications">
            <Bell size={18} />{unread > 0 && <span className="bell-count">{unread}</span>}
          </Link>
          <div className="user-menu" ref={menuRef}>
            <button className="user-button" onClick={() => setMenuOpen(!menuOpen)} aria-haspopup="menu" aria-expanded={menuOpen}>
              <span className="avatar">{initials(user.fullName)}</span>
              <span className="user-text"><strong>{user.fullName}</strong><small>{roleLabel}</small></span>
              <ChevronDown size={14} />
            </button>
            {menuOpen && (
              <div className="menu" role="menu">
                <div className="menu-head"><strong>{user.fullName}</strong><small>{user.email}</small></div>
                {user.role === 'student' && <button className="menu-item" onClick={() => navigate('/profile')}><UserRound size={16} />My profile</button>}
                <button className="menu-item" onClick={() => navigate('/notifications')}><Bell size={16} />Notifications</button>
                <button className="menu-item" onClick={() => navigate('/change-password')}><KeyRound size={16} />Change password</button>
                <button className="menu-item" onClick={logout}><LogOut size={16} />Sign out</button>
              </div>
            )}
          </div>
        </header>
        <main className="content"><Outlet /></main>
      </div>
    </div>
  );
}
