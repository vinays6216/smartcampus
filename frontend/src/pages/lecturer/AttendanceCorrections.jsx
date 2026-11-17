import { useState } from 'react';
import { get } from '../../api/client';
import useFetch from '../../hooks/useFetch';
import { Async, Badge, Empty, PageHeader } from '../../components/ui';
import { fmtDate, fmtDateTime } from '../../utils/format';
import { classLabel, clean, downloadCsv } from '../../utils/helpers';

// Lecturer + admin: every logged attendance change (approved issues and manual edits), newest first.
export default function AttendanceCorrections() {
  const classes = useFetch(() => get('/teaching'), []);
  const [filters, setFilters] = useState({ teachingAssignmentId: '', from: '', to: '' });
  const invalid = filters.from && filters.to && filters.from > filters.to;
  const f = useFetch(() => (invalid ? Promise.resolve({ data: [] }) : get('/attendance/corrections', clean(filters))),
    [filters.teachingAssignmentId, filters.from, filters.to]);
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });
  const rows = f.data || [];

  const exportCsv = () => downloadCsv('attendance-corrections.csv', [
    ['Changed at', 'Class date', 'Period', 'Subject', 'Section', 'USN', 'Student', 'Old status', 'New status', 'Changed by', 'Reason', 'Issue'],
    ...rows.map((r) => [r.changedAt, r.sessionDate, r.periodNo, r.subjectCode, r.sectionName, r.usn, r.studentName,
      r.oldStatus, r.newStatus, r.changedByName || '', r.reason || '', r.issueId ? `#${r.issueId}` : '']),
  ]);

  return (
    <>
      <PageHeader title="Attendance Corrections" subtitle="Every change to a marked attendance entry, with who changed it and why">
        {!!rows.length && <button className="btn" onClick={exportCsv}>Export CSV</button>}
      </PageHeader>

      <div className="card">
        <div className="filters">
          <div><label>Class</label>
            <select value={filters.teachingAssignmentId} onChange={set('teachingAssignmentId')}>
              <option value="">All my classes</option>
              {(classes.data || []).map((t) => <option key={t.id} value={t.id}>{classLabel(t)}</option>)}
            </select></div>
          <div><label>Changed from</label><input type="date" value={filters.from} onChange={set('from')} /></div>
          <div><label>To</label><input type="date" value={filters.to} onChange={set('to')} /></div>
        </div>
        {invalid && <div className="alert alert-error">"From" date must be on or before the "To" date.</div>}

        <Async f={f}>
          {!rows.length && <Empty>No attendance changes logged for this filter.</Empty>}
          {!!rows.length && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Changed at</th><th>Class</th><th>Student</th><th>Change</th><th>Changed by</th><th>Reason</th></tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{fmtDateTime(r.changedAt)}</td>
                      <td>{r.subjectCode} - {r.subjectName}<div className="muted">Sec {r.sectionName}, {fmtDate(r.sessionDate)}, period {r.periodNo}</div></td>
                      <td>{r.usn}<div className="muted">{r.studentName}</div></td>
                      <td><Badge value={r.oldStatus} /> → <Badge value={r.newStatus} /></td>
                      <td>{r.changedByName || '-'}{r.changedByRole && <div className="muted">{r.changedByRole}</div>}</td>
                      <td>{r.reason || '-'}{r.issueId && <div className="muted">Issue #{r.issueId}</div>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Async>
      </div>
    </>
  );
}
