// The backend returns dates as plain strings: "2026-10-20" or "2026-10-20 17:00:00"
const parse = (s) => {
  const str = String(s);
  return new Date(str.length === 10 ? `${str}T00:00:00` : str.replace(' ', 'T'));
};

export const fmtDate = (s) => (s ? parse(s).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');
export const fmtDateTime = (s) =>
  s ? parse(s).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
export const fmtTime = (t) => (t ? String(t).slice(0, 5) : '');
export const today = () => new Date().toLocaleDateString('en-CA');
export const toInputDateTime = (s) => (s ? String(s).slice(0, 16).replace(' ', 'T') : '');

export const fmtSize = (bytes) => {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export function timeLeft(deadline) {
  const ms = parse(deadline) - Date.now();
  if (ms < 0) return 'Deadline passed';
  const hours = Math.floor(ms / 36e5);
  const days = Math.floor(hours / 24);
  if (days >= 1) return `${days}d ${hours % 24}h left`;
  return `${hours}h ${Math.floor((ms % 36e5) / 6e4)}m left`;
}
