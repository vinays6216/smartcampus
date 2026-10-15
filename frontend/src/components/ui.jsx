import { Link } from 'react-router-dom';
import { label, tone } from '../utils/helpers';

export const Spinner = () => <div className="spinner" />;

export function Badge({ value, tone: forced, children }) {
  return <span className={`badge badge-${forced || tone(value)}`}>{children ?? label(value)}</span>;
}

export function ErrorBox({ message, onRetry }) {
  return (
    <div className="alert alert-error">
      {message} {onRetry && <button className="btn btn-sm" onClick={onRetry}>Retry</button>}
    </div>
  );
}

export const Empty = ({ children = 'Nothing to show yet.' }) => <div className="empty">{children}</div>;

// Shows a spinner / error until the useFetch result is ready, then renders the children
export function Async({ f, children }) {
  if (f.loading && !f.body) return <div className="center"><Spinner /></div>;
  if (f.error) return <ErrorBox message={f.error} onRetry={f.reload} />;
  return children;
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      <div className="actions">{children}</div>
    </div>
  );
}

export function Tabs({ items, active, onChange }) {
  return (
    <div className="tabs">
      {items.map((t) => (
        <button key={t.key} className={`tab ${active === t.key ? 'active' : ''}`} onClick={() => onChange(t.key)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function StatCard({ label: text, value, tone: t = 'blue', to }) {
  const body = (
    <div className={`stat stat-${t}`}>
      <div className="stat-value">{value ?? '-'}</div>
      <div className="stat-label">{text}</div>
    </div>
  );
  return to ? <Link to={to} className="stat-link">{body}</Link> : body;
}

export function Pagination({ page, limit, total, onChange }) {
  const pages = Math.max(Math.ceil(total / limit), 1);
  if (pages <= 1) return null;
  return (
    <div className="pagination">
      <button className="btn btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>Prev</button>
      <span>Page {page} of {pages} ({total} records)</span>
      <button className="btn btn-sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>Next</button>
    </div>
  );
}

export function PercentBar({ value, min = 75 }) {
  if (value === null || value === undefined) return <span className="muted">-</span>;
  return (
    <div className="pbar-wrap">
      <div className="pbar"><div className={`pbar-fill ${value < min ? 'low' : ''}`} style={{ width: `${Math.min(value, 100)}%` }} /></div>
      <span className={value < min ? 'text-red' : ''}>{value}%</span>
    </div>
  );
}
