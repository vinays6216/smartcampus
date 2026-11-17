import { useState } from 'react';
import api, { get, patch } from '../../api/client';
import useFetch from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import FormModal from '../../components/FormModal';
import FileButton from '../../components/FileButton';
import { Async, Badge, Empty, PageHeader, PercentBar, StatCard, Tabs } from '../../components/ui';
import { fmtDate, fmtDateTime, today } from '../../utils/format';
import { clean, errMsg, toFormData } from '../../utils/helpers';

const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('en-CA'); };
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('en-CA'); };
const PRESETS = [
  { key: 'all', label: 'All classes', range: () => ({ from: '', to: '' }) },
  { key: 'month', label: 'This month', range: () => ({ from: monthStart(), to: today() }) },
  { key: '30', label: 'Last 30 days', range: () => ({ from: daysAgo(29), to: today() }) },
  { key: '7', label: 'Last 7 days', range: () => ({ from: daysAgo(6), to: today() }) },
];

export default function Attendance() {
  const toast = useToast();
  const [tab, setTab] = useState('days');
  const [filters, setFilters] = useState({ from: '', to: '', subjectCode: '', status: '' });
  const [range, setRange] = useState({ from: '', to: '' }); // date range for the percentage summary
  const [target, setTarget] = useState(null); // the absent entry the student is raising an issue for

  const rangeInvalid = range.from && range.to && range.from > range.to;
  const summary = useFetch(() => (rangeInvalid ? Promise.resolve(null) : get('/attendance/student/summary', clean(range))), [range.from, range.to]);
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

      <div className="card">
        <div className="filters">
          <div><label>Percentage from</label><input type="date" value={range.from} max={range.to || undefined} onChange={(e) => setRange({ ...range, from: e.target.value })} /></div>
          <div><label>To</label><input type="date" value={range.to} min={range.from || undefined} onChange={(e) => setRange({ ...range, to: e.target.value })} /></div>
          <div className="btn-group" style={{ alignSelf: 'flex-end' }}>
            {PRESETS.map((p) => (
              <button key={p.key} type="button" className="btn btn-sm" onClick={() => setRange(p.range())}>{p.label}</button>
            ))}
          </div>
        </div>
        {rangeInvalid && <div className="alert alert-error">"From" date must be on or before the "To" date.</div>}
        {s?.rule && (
          <div className="alert alert-info">
            <strong>How it is calculated:</strong> {s.rule.text}. Minimum required: {s.rule.minRequiredPercent}%.
            {' '}Showing {s.from || s.to ? `${s.from ? fmtDate(s.from) : 'the first class'} to ${s.to ? fmtDate(s.to) : 'today'}` : 'all classes so far'}.
          </div>
        )}
      </div>

      <Async f={summary}>
        {s && (
          <>
            <div className="grid">
              <StatCard label={s.from || s.to ? 'Attendance in this period' : 'Overall attendance'} value={s.overallPercentage != null ? `${s.overallPercentage}%` : '-'}
                tone={s.overallPercentage != null && s.overallPercentage < s.minRequiredPercent ? 'red' : 'green'} />
              <StatCard label="Minimum required" value={`${s.minRequiredPercent}%`} tone="amber" />
              {s.overall?.toReach > 0 && <StatCard label={`Classes in a row to reach ${s.minRequiredPercent}% overall`} value={s.overall.toReach} tone="red" />}
              {s.overall?.toReach === 0 && s.overall?.canMiss != null && <StatCard label="Classes you can still miss overall" value={s.overall.canMiss} tone="green" />}
            </div>
            <div className="card">
              <h2>Subject-wise attendance</h2>
              {!s.subjects.length && <Empty>{s.from || s.to ? 'No classes in this period.' : 'No attendance has been marked yet.'}</Empty>}
              {!!s.subjects.length && (
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Subject</th><th>Classes</th><th>Attended</th><th>Absent</th><th>Percentage</th><th>What it means</th></tr></thead>
                    <tbody>
                      {s.subjects.map((x) => (
                        <tr key={x.teachingAssignmentId} className={x.belowMinimum ? 'row-low' : ''}>
                          <td><strong>{x.subjectCode}</strong> {x.subjectName}</td>
                          <td>{x.totalClasses}</td><td>{x.attendedClasses}</td><td>{x.absentClasses}</td>
                          <td><PercentBar value={x.attendancePercentage} min={s.minRequiredPercent} /></td>
                          <td><MarginText toReach={x.classesToReach} canMiss={x.canMiss} min={s.minRequiredPercent} /></td>
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
                {i.status === 'approved' && (
                  <div className="text-green">Corrected to <strong>{i.currentStatus}</strong> on {fmtDateTime(i.resolvedAt)} by {i.resolvedByName}. The change is logged.</div>
                )}
                {i.status === 'rejected' && <div className="muted">Rejected on {fmtDateTime(i.resolvedAt)} by {i.resolvedByName}.</div>}
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

// "Attend the next 3 classes to reach 75%" / "You can miss 2 more classes"
function MarginText({ toReach, canMiss, min }) {
  if (toReach > 0) return <span className="text-red">Attend the next <strong>{toReach}</strong> class{toReach === 1 ? '' : 'es'} in a row to reach {min}%</span>;
  if (canMiss == null) return <span className="muted">-</span>;
  if (canMiss === 0) return <span className="muted">Exactly at the limit — don't miss the next class</span>;
  return <span className="text-green">You can miss <strong>{canMiss}</strong> more class{canMiss === 1 ? '' : 'es'} and stay at {min}%</span>;
}
