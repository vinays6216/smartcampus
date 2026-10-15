import { useState } from 'react';
import { get } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import useFetch from '../../hooks/useFetch';
import { Empty, PageHeader, PercentBar, Spinner } from '../../components/ui';
import { today } from '../../utils/format';
import { classLabel, downloadCsv, errMsg } from '../../utils/helpers';

const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('en-CA'); };

// Lecturer + admin: attendance percentage between two dates, optionally only students below a given %
export default function AttendanceReport() {
  const toast = useToast();
  const classes = useFetch(() => get('/teaching'), []);
  const [form, setForm] = useState({ teachingAssignmentId: '', from: daysAgo(30), to: today(), below: '' });
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sortAsc, setSortAsc] = useState(true);

  const run = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const params = { teachingAssignmentId: form.teachingAssignmentId, from: form.from, to: form.to };
      if (form.below !== '') params.below = form.below;
      setRows((await get('/attendance/report', params)).data);
    } catch (err) { toast.error(errMsg(err)); } finally { setLoading(false); }
  };

  const sorted = rows ? [...rows].sort((a, b) => (sortAsc ? 1 : -1) * ((a.attendancePercentage ?? 0) - (b.attendancePercentage ?? 0))) : [];
  const limit = form.below !== '' ? Number(form.below) : 75;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const exportCsv = () => downloadCsv('attendance-report.csv', [
    ['USN', 'Name', 'Classes', 'Attended', 'Absent', 'Percentage'],
    ...sorted.map((r) => [r.usn, r.fullName, r.totalClasses, r.attendedClasses, r.absentClasses, r.attendancePercentage]),
  ]);

  return (
    <>
      <PageHeader title="Attendance Report" subtitle="Attendance percentage of every student between two dates" />
      <form className="card filters" onSubmit={run}>
        <div style={{ minWidth: 320 }}><label>Class</label>
          <select required value={form.teachingAssignmentId} onChange={set('teachingAssignmentId')}>
            <option value="">Select class...</option>
            {(classes.data || []).map((t) => <option key={t.id} value={t.id}>{classLabel(t)}</option>)}
          </select></div>
        <div><label>From date</label><input type="date" required value={form.from} onChange={set('from')} /></div>
        <div><label>To date</label><input type="date" required value={form.to} onChange={set('to')} /></div>
        <div><label>Only below % (optional)</label><input type="number" min={0} max={100} placeholder="e.g. 75" value={form.below} onChange={set('below')} /></div>
        <button className="btn btn-primary" disabled={loading}>Show report</button>
      </form>

      {loading && <div className="center"><Spinner /></div>}
      {rows && !loading && (
        <div className="card">
          <div className="row" style={{ marginBottom: '.8rem' }}>
            <h2 style={{ margin: 0 }}>{rows.length} student(s){form.below !== '' ? ` below ${form.below}%` : ''}</h2>
            <div className="btn-group">
              <button className="btn btn-sm" onClick={() => setSortAsc(!sortAsc)}>Sort: {sortAsc ? 'lowest first' : 'highest first'}</button>
              {!!rows.length && <button className="btn btn-sm" onClick={exportCsv}>Export CSV</button>}
            </div>
          </div>
          {!rows.length && <Empty>No students match.</Empty>}
          {!!rows.length && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>USN</th><th>Name</th><th>Classes</th><th>Attended</th><th>Absent</th><th>Percentage</th></tr></thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.studentId} className={r.attendancePercentage < 75 ? 'row-low' : ''}>
                      <td>{r.usn}</td><td>{r.fullName}</td><td>{r.totalClasses}</td><td>{r.attendedClasses}</td><td>{r.absentClasses}</td>
                      <td><PercentBar value={r.attendancePercentage} min={limit} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}
