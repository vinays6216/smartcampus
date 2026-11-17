import { useState } from 'react';
import { get } from '../../api/client';
import useFetch from '../../hooks/useFetch';
import { Async, Badge, Empty, PageHeader, Pagination } from '../../components/ui';
import { fmtDateTime } from '../../utils/format';

const nice = (a) => a.toLowerCase().replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
const tone = (a) => (/DELETED|REJECTED|STATUS|RESET/.test(a) ? 'amber' : /CREATED|APPROVED|IMPORTED/.test(a) ? 'green' : 'blue');

// Short human summary of the stored old/new values.
function details(r) {
  const v = r.newValues || r.oldValues;
  if (!v || typeof v !== 'object') return '';
  return Object.entries(v)
    .filter(([, x]) => x !== null && x !== undefined && typeof x !== 'object')
    .slice(0, 5)
    .map(([k, x]) => `${k}: ${x}`)
    .join(' · ');
}

// Platform admin: who did what and when (audit_logs).
export default function Activity() {
  const [filters, setFilters] = useState({ from: '', to: '', action: '', q: '' });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const params = Object.fromEntries(Object.entries({ ...filters, page }).filter(([, v]) => v !== ''));
  const log = useFetch(() => get('/platform/activity', params), [JSON.stringify(params)]);
  const set = (k) => (e) => { setFilters({ ...filters, [k]: e.target.value }); setPage(1); };

  return (
    <>
      <PageHeader title="Activity Log" subtitle="Who did what and when: accounts, permissions, passwords, deleted classes, leave decisions" />
      <div className="card filters">
        <div style={{ minWidth: 220 }}><label>Search</label><input type="text" placeholder="Name, email or action" value={filters.q} onChange={set('q')} /></div>
        <div><label>Action</label>
          <select value={filters.action} onChange={set('action')}>
            <option value="">All actions</option>
            {(log.body?.actions || []).map((a) => <option key={a} value={a}>{nice(a)}</option>)}
          </select></div>
        <div><label>From</label><input type="date" value={filters.from} onChange={set('from')} /></div>
        <div><label>To</label><input type="date" value={filters.to} onChange={set('to')} /></div>
      </div>

      <div className="card">
        <Async f={log}>
          {!log.data?.length && <Empty>No activity matches.</Empty>}
          {!!log.data?.length && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>When</th><th>Who</th><th>Action</th><th>On</th><th>Details</th></tr></thead>
                <tbody>
                  {log.data.map((r) => (
                    <tr key={r.id} className="clickable" onClick={() => setOpen(open === r.id ? null : r.id)}>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(r.createdAt)}</td>
                      <td>{r.userName ? <><strong>{r.userName}</strong><div className="muted">{r.userRole} · {r.userEmail}</div></> : <span className="muted">System</span>}</td>
                      <td><Badge value={r.action} tone={tone(r.action)}>{nice(r.action)}</Badge></td>
                      <td>{r.entityType}{r.entityId ? ` #${r.entityId}` : ''}</td>
                      <td style={{ maxWidth: 380 }}>
                        <span className="muted">{details(r)}</span>
                        {open === r.id && (r.oldValues || r.newValues) && (
                          <pre className="log-json">{JSON.stringify({ before: r.oldValues, after: r.newValues }, null, 2)}</pre>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {log.body?.pagination && <Pagination {...log.body.pagination} onChange={setPage} />}
        </Async>
      </div>
    </>
  );
}
