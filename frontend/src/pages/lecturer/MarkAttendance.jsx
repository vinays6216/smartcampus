import { useEffect, useState } from 'react';
import { get, post, put } from '../../api/client';
import useFetch from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import { Async, Badge, Empty, PageHeader } from '../../components/ui';
import { fmtDate, today } from '../../utils/format';
import { classLabel, errMsg } from '../../utils/helpers';

const STATUSES = ['present', 'absent', 'late', 'excused'];

export default function MarkAttendance() {
  const toast = useToast();
  const [taId, setTaId] = useState('');
  const [date, setDate] = useState(today());
  const [period, setPeriod] = useState(1);
  const [meta, setMeta] = useState({ topic: '', startTime: '', endTime: '' });
  const [reason, setReason] = useState('');
  const [marks, setMarks] = useState({}); // studentId -> { status, remarks }
  const [saving, setSaving] = useState(false);

  const classes = useFetch(() => get('/teaching'), []);
  // students of the class + whether this date/period was already marked
  const roster = useFetch(() => (taId ? get(`/teaching/${taId}/roster`, { date, period }) : Promise.resolve(null)), [taId, date, period]);
  const sessions = useFetch(() => (taId ? get('/attendance/sessions', { teachingAssignmentId: taId }) : Promise.resolve(null)), [taId]);

  const students = roster.data?.students || [];
  const existingId = roster.data?.existingSessionId || null;

  // fill the marks: everybody present for a new class, or the saved marks when editing
  useEffect(() => {
    if (!roster.data) { setMarks({}); return; }
    let alive = true;
    (async () => {
      if (existingId) {
        try {
          const session = (await get(`/attendance/sessions/${existingId}`)).data;
          if (!alive) return;
          setMarks(Object.fromEntries(session.records.map((r) => [r.studentId, { status: r.status, remarks: r.remarks || '' }])));
          setMeta({ topic: session.topic || '', startTime: session.startTime?.slice(0, 5) || '', endTime: session.endTime?.slice(0, 5) || '' });
        } catch (e) { toast.error(errMsg(e)); }
      } else {
        setMarks(Object.fromEntries(roster.data.students.map((s) => [s.studentId, { status: 'present', remarks: '' }])));
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster.body]);

  const setStatus = (id, status) => setMarks((m) => ({ ...m, [id]: { ...m[id], status } }));
  const setRemark = (id, remarks) => setMarks((m) => ({ ...m, [id]: { ...m[id], remarks } }));
  const markAll = (status) => setMarks(Object.fromEntries(students.map((s) => [s.studentId, { status, remarks: '' }])));

  const counts = STATUSES.map((s) => [s, Object.values(marks).filter((m) => m.status === s).length]);

  const toRecord = ([studentId, m]) => ({ studentId: Number(studentId), status: m.status, ...(m.remarks ? { remarks: m.remarks } : {}) });

  const save = async () => {
    setSaving(true);
    try {
      if (existingId) {
        await put(`/attendance/sessions/${existingId}/records`, { records: Object.entries(marks).map(toRecord), ...(reason ? { reason } : {}) });
        toast.success('Attendance updated');
      } else {
        const body = {
          teachingAssignmentId: Number(taId), sessionDate: date, periodNo: Number(period),
          ...(meta.topic ? { topic: meta.topic } : {}),
          ...(meta.startTime ? { startTime: meta.startTime } : {}),
          ...(meta.endTime ? { endTime: meta.endTime } : {}),
          // only students who are not present need to be sent; the rest default to present
          records: Object.entries(marks).filter(([, m]) => m.status !== 'present').map(toRecord),
        };
        await post('/attendance/sessions', body);
        toast.success('Attendance saved');
      }
      roster.reload();
      sessions.reload();
    } catch (e) { toast.error(errMsg(e)); } finally { setSaving(false); }
  };

  return (
    <>
      <PageHeader title="Mark Attendance" subtitle="Choose the class, date and period. Everybody starts as present." />

      <div className="card">
        <Async f={classes}>
          <div className="filters">
            <div style={{ minWidth: 320 }}><label>Class</label>
              <select value={taId} onChange={(e) => setTaId(e.target.value)}>
                <option value="">Select class...</option>
                {(classes.data || []).map((t) => <option key={t.id} value={t.id}>{classLabel(t)}</option>)}
              </select></div>
            <div><label>Date</label><input type="date" max={today()} value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div><label>Period</label><input type="number" min={1} max={12} value={period} onChange={(e) => setPeriod(e.target.value || 1)} /></div>
            <div><label>Topic (optional)</label><input type="text" value={meta.topic} onChange={(e) => setMeta({ ...meta, topic: e.target.value })} /></div>
            <div><label>Start</label><input type="time" value={meta.startTime} onChange={(e) => setMeta({ ...meta, startTime: e.target.value })} /></div>
            <div><label>End</label><input type="time" value={meta.endTime} onChange={(e) => setMeta({ ...meta, endTime: e.target.value })} /></div>
          </div>
        </Async>
      </div>

      {!taId && <div className="card"><Empty>Select a class to load its students.</Empty></div>}

      {taId && (
        <div className="card">
          <Async f={roster}>
            {existingId && (
              <div className="alert alert-warn">
                Attendance for this date and period is already saved. You are editing it; every change is recorded in the history.
              </div>
            )}
            <div className="row" style={{ marginBottom: '.8rem' }}>
              <div className="btn-group">
                <button className="btn btn-sm" onClick={() => markAll('present')}>All present</button>
                <button className="btn btn-sm" onClick={() => markAll('absent')}>All absent</button>
              </div>
              <div className="btn-group">{counts.map(([s, n]) => <Badge key={s} value={s}>{s}: {n}</Badge>)}</div>
            </div>

            {!students.length && <Empty>No active students in this section.</Empty>}
            {!!students.length && (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>#</th><th>USN</th><th>Name</th><th>Status</th><th>Remarks</th></tr></thead>
                  <tbody>
                    {students.map((s, i) => (
                      <tr key={s.studentId} className={marks[s.studentId]?.status === 'absent' ? 'row-low' : ''}>
                        <td>{i + 1}</td><td>{s.usn}</td><td>{s.fullName}</td>
                        <td>
                          <div className="btn-group">
                            {STATUSES.map((st) => (
                              <button key={st} type="button"
                                className={`btn btn-sm ${marks[s.studentId]?.status === st ? (st === 'absent' ? 'btn-danger' : 'btn-primary') : ''}`}
                                onClick={() => setStatus(s.studentId, st)}>{st}</button>
                            ))}
                          </div>
                        </td>
                        <td><input type="text" placeholder="optional" value={marks[s.studentId]?.remarks || ''} onChange={(e) => setRemark(s.studentId, e.target.value)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!!students.length && (
              <div className="row" style={{ marginTop: '1rem', alignItems: 'center' }}>
                {existingId
                  ? <input type="text" style={{ maxWidth: 360 }} placeholder="Reason for the change (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
                  : <span />}
                <button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Saving...' : existingId ? 'Update attendance' : 'Save attendance'}</button>
              </div>
            )}
          </Async>
        </div>
      )}

      {taId && sessions.data?.length > 0 && (
        <div className="card">
          <h2>Classes already marked</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Period</th><th>Topic</th><th>Present</th><th>Absent</th><th /></tr></thead>
              <tbody>
                {sessions.data.map((s) => (
                  <tr key={s.id}>
                    <td>{fmtDate(s.sessionDate)}</td><td>{s.periodNo}</td><td>{s.topic || '-'}</td><td>{s.presentCount}</td><td>{s.absentCount}</td>
                    <td><button className="btn btn-sm" onClick={() => { setDate(s.sessionDate); setPeriod(s.periodNo); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Open</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
