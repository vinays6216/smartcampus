import { useState } from 'react';
import { CalendarCheck2, ClipboardCheck, Eye, EyeOff, FileText, GraduationCap } from 'lucide-react';
import ThemeToggle from '../../components/ThemeToggle';
import './auth.css';

const FEATURES = [
  [ClipboardCheck, 'Attendance'],
  [FileText, 'Assignments'],
  [CalendarCheck2, 'Timetable & events'],
];

// Simple centred sign-in frame: logo, one card, a line of what the app does.
export function AuthLayout({ title, description, children, footer }) {
  return (
    <main className="au-page">
      <div className="au-top"><ThemeToggle /></div>
      <div className="au-center">
        <div className="au-logo"><GraduationCap size={26} /></div>
        <p className="au-name">Smart Campus</p>
        <div className="au-card">
          <h1>{title}</h1>
          {description && <p className="au-description">{description}</p>}
          {children}
        </div>
        {footer && <div className="au-footer">{footer}</div>}
        <ul className="au-features" aria-label="What you can do">
          {FEATURES.map(([Icon, text]) => <li key={text}><Icon size={14} />{text}</li>)}
        </ul>
      </div>
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
