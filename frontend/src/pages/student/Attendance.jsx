import { useState } from 'react';
import api, { get, patch } from '../../api/client';
import useFetch from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import FormModal from '../../components/FormModal';
import FileButton from '../../components/FileButton';
import { Async, Badge, Empty, PageHeader, PercentBar, StatCard, Tabs } from '../../components/ui';
import { fmtDate, fmtDateTime } from '../../utils/format';
import { clean, errMsg, toFormData } from '../../utils/helpers';

export default function Attendance() {
  const toast = useToast();
  const [tab, setTab] = useState('days');
  const [filters, setFilters] = useState({ from: '', to: '', subjectCode: '', status: '' });
  const [target, setTarget] = useState(null); // the absent entry the student is raising an issue for

  const summary = useFetch(() => get('/attendance/student/summary'), []);
  const detail = useFetch(() => get('/attendance/student/detail', clean(filters)), [filters]);
  const issues = useFetch(() => get('/attendance/issues/mine'), []);

  const s = summary.data;

  const raise = async (v) => {
    await api.post('/attendance/issues', toFormData({ attendanceRecordId: target.attendanceRecordId, reason: v.reason, proof: v.proof }));
    toast.success('Issue sent to the lecturer');
    setTarget(null);
    detail.reload();
    issues.reload();
  };

  const withdraw = async (id) => {
    try { await patch(`/attendance/issues/${id}/withdraw`); toast.success('Issue withdrawn'); detail.reload(); issues.reload(); } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <>
      <PageHeader title="My Attendance" subtitle="See the days you attended or missed, and raise an issue if you were marked absent by mistake" />

      <Async f={summary}>
        {s && (
          <>
            <div className="grid">
              <StatCard label="Overall attendance" value={s.overallPercentage != null ? `${s.overallPercentage}%` : '-'}
                tone={s.overallPercentage != null && s.overallPercentage < s.minRequiredPercent ? 'red' : 'green'} />
              <StatCard label="Minimum required" value={`${s.minRequiredPercent}%`} tone="amber" />
            </div>
            <div className="card">
              <h2>Subject-wise attendance</h2>
              {!s.subjects.length && <Empty>No attendance has been marked yet.</Empty>}
              {!!s.subjects.length && (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Subject</th><th>Classes</th><th>Attended</th><th>Absent</th><th>Percentage</th></tr></thead>
                    <tbody>
                      {s.subjects.map((x) => (
                        <tr key={x.teachingAssignmentId} className={x.belowMinimum ? 'row-low' : ''}>
                          <td><strong>{x.subjectCode}</strong> {x.subjectName}</td>
                          <td>{x.totalClasses}</td><td>{x.attendedClasses}</td><td>{x.absentClasses}</td>
                          <td><PercentBar value={x.attendancePercentage} min={s.minRequiredPercent} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </Async>

      <Tabs active={tab} onChange={setTab} items={[{ key: 'days', label: 'Day by day' }, { key: 'issues', label: 'My issues' }]} />

      {tab === 'days' && (
        <div className="card">
          <div className="filters">
            <div><label>From</label><input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></div>
            <div><label>To</label><input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></div>
            <div><label>Subject</label>
              <select value={filters.subjectCode} onChange={(e) => setFilters({ ...filters, subjectCode: e.target.value })}>
                <option value="">All</option>
                {(s?.subjects || []).map((x) => <option key={x.subjectCode} value={x.subjectCode}>{x.subjectCode}</option>)}
              </select></div>
            <div><label>Status</label>
              <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
                <option value="">All</option><option value="present">Present</option><option value="absent">Absent</option>
                <option value="late">Late</option><option value="excused">Excused</option>
              </select></div>
          </div>
          <Async f={detail}>
            {!detail.data?.length && <Empty>No records for this filter.</Empty>}
            {!!detail.data?.length && (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Date</th><th>Period</th><th>Subject</th><th>Status</th><th>Issue</th></tr></thead>
                  <tbody>
                    {detail.data.map((r) => (
                      <tr key={r.attendanceRecordId} className={r.status === 'absent' ? 'row-low' : ''}>
                        <td>{fmtDate(r.sessionDate)}</td><td>{r.periodNo}</td>
                        <td>{r.subjectCode} - {r.subjectName}</td>
                        <td><Badge value={r.status} /></td>
                        <td>
                          {r.issueId && <Badge value={r.issueStatus}>Issue {r.issueStatus}</Badge>}
                          {r.status === 'absent' && !r.issueId && (
                            <button className="btn btn-sm" onClick={() => setTarget(r)}>Raise issue</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Async>
        </div>
      )}

      {tab === 'issues' && (
        <div className="card">
          <Async f={issues}>
            {!issues.data?.length && <Empty>You have not raised any attendance issue.</Empty>}
            {issues.data?.map((i) => (
              <div key={i.id} className="list-item">
                <div className="row">
                  <div>
                    <strong>{i.subjectCode} - {i.subjectName}</strong>
                    <div className="muted">Class on {fmtDate(i.sessionDate)} (period {i.periodNo}) - raised {fmtDateTime(i.raisedAt)}</div>
                  </div>
                  <div className="btn-group">
                    <Badge value={i.status} />
                    <FileButton fileId={i.proofFileId} name="proof" extension="pdf" />
                    {i.status === 'open' && <button className="btn btn-sm" onClick={() => withdraw(i.id)}>Withdraw</button>}
                  </div>
                </div>
                <div>Reason: {i.reason}</div>
                {i.resolutionRemarks && <div className="muted">Lecturer remarks: {i.resolutionRemarks}</div>}
              </div>
            ))}
          </Async>
        </div>
      )}

      <FormModal
        open={!!target}
        title="Raise attendance issue"
        submitLabel="Send to lecturer"
        onClose={() => setTarget(null)}
        onSubmit={raise}
        fields={[
          { name: 'reason', label: 'What went wrong?', type: 'textarea', required: true, placeholder: 'I was present in the class but marked absent...' },
          { name: 'proof', label: 'Proof (optional: PDF, PNG, JPG - max 5 MB)', type: 'file', accept: '.pdf,.png,.jpg,.jpeg' },
        ]}
      >
        {target && (
          <div className="alert alert-info full">
            {target.subjectName} - {fmtDate(target.sessionDate)}, period {target.periodNo}. Issues can be raised only within a few days of the class.
          </div>
        )}
      </FormModal>
    </>
  );
}
