import { useState } from 'react';
import { CalendarCheck2, ClipboardCheck, Eye, EyeOff, FileText, GraduationCap } from 'lucide-react';
import './auth.css';

const FEATURES = [
  { icon: ClipboardCheck, title: 'Attendance you can trust', text: 'Marked per period, % by date range, every correction logged.' },
  { icon: FileText, title: 'Assignments on time', text: 'Deadlines, URL or PDF submissions, on-time / late at a glance.' },
  { icon: CalendarCheck2, title: 'Everyone in the loop', text: 'Timetable, announcements and calendar for the right people.' },
];

// Two-column sign-in frame (same design as CampusPulse): brand panel (hidden on phones) + form card.
export function AuthLayout({ eyebrow, title, description, children, footer }) {
  return (
    <main className="au-page">
      <aside className="au-brand-panel" aria-hidden="true">
        <div className="au-brand">
          <span className="au-logo"><GraduationCap size={18} /></span>
          Smart Campus
        </div>
        <div>
          <h1>Your whole campus,<br />one place.</h1>
          <ul className="au-features">
            {FEATURES.map(({ icon: Icon, title: name, text }) => (
              <li key={name}>
                <span className="au-feature-icon"><Icon size={16} /></span>
                <span><strong>{name}</strong><small>{text}</small></span>
              </li>
            ))}
          </ul>
        </div>
        <small className="au-muted-light">For students, lecturers and administrators</small>
      </aside>

      <section className="au-form-side">
        <div className="au-card">
          <div className="au-brand au-brand-mobile">
            <span className="au-logo"><GraduationCap size={18} /></span>
            Smart Campus
          </div>
          {eyebrow && <span className="au-eyebrow">{eyebrow}</span>}
          <h2>{title}</h2>
          {description && <p className="au-description">{description}</p>}
          {children}
          {footer && <div className="au-footer">{footer}</div>}
        </div>
      </section>
    </main>
  );
}

// Password input with show/hide toggle.
export function PasswordInput({ value, onChange, ...props }) {
  const [shown, setShown] = useState(false);
  return (
    <span className="au-password">
      <input type={shown ? 'text' : 'password'} value={value} onChange={onChange} {...props} />
      <button type="button" onClick={() => setShown((v) => !v)} aria-label={shown ? 'Hide password' : 'Show password'}>
        {shown ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </span>
  );
}
