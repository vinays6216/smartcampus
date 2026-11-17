import { useState } from 'react';
import { del, get, post, put } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import useFetch from '../../hooks/useFetch';
import FormModal from '../../components/FormModal';
import { Badge, Empty, PageHeader, PercentBar, Spinner } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { today } from '../../utils/format';
import { classLabel, downloadCsv, errMsg, sectionShort } from '../../utils/helpers';
import { FileDown } from 'lucide-react';

const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toLocaleDateString('en-CA'); };

// Lecturer + admin: attendance percentage between two dates, optionally only students below a given %
export default function AttendanceReport() {
  const toast = useToast();
  const { user } = useAuth();
  const classes = useFetch(() => get('/teaching'), []);
  const [form, setForm] = useState({ teachingAssignmentId: '', from: daysAgo(30), to: today(), below: '' });
  const [rows, setRows] = useState(null);
  const [rule, setRule] = useState(null);
  const [loading, setLoading] = useState(false);
  const [sortAsc, setSortAsc] = useState(true);

  const run = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const params = { teachingAssignmentId: form.teachingAssignmentId, from: form.from, to: form.to };
      if (form.below !== '') params.below = form.below;
      const body = await get('/attendance/report', params);
      setRows(body.data);
      setRule(body.rule || null);
    } catch (err) { toast.error(errMsg(err)); } finally { setLoading(false); }
  };

  const sorted = rows ? [...rows].sort((a, b) => (sortAsc ? 1 : -1) * ((a.attendancePercentage ?? 0) - (b.attendancePercentage ?? 0))) : [];
  const minimum = rule?.minRequiredPercent ?? 75;
  const limit = form.below !== '' ? Number(form.below) : minimum;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  // day-wise register (student x class) for the chosen class and dates
  const [regLoading, setRegLoading] = useState(false);
  const SHORT = { present: 'P', absent: 'A', late: 'L', excused: 'E' };
  const [register, setRegister] = useState(null); // { data, rule, editing } shown below the report
  const [cellEdit, setCellEdit] = useState(null); // { session, student, status }
  const loadRegister = () => get('/attendance/register', { teachingAssignmentId: form.teachingAssignmentId, from: form.from, to: form.to });
  const showRegister = async () => {
    if (!form.teachingAssignmentId) { toast.error('Select a class first'); return; }
    setRegLoading(true);
    try { setRegister(await loadRegister()); } catch (err) { toast.error(errMsg(err)); } finally { setRegLoading(false); }
  };
  const reasonRequired = !!register?.editing?.reasonRequired;
  const saveCell = async (v) => {
    await put(`/attendance/sessions/${cellEdit.session.id}/records`, {
      records: [{ studentId: cellEdit.student.studentId, status: v.status }], ...(v.reason ? { reason: v.reason } : {}),
    });
    toast.success(`${cellEdit.student.usn}: ${cellEdit.session.sessionDate} P${cellEdit.session.periodNo} is now ${v.status}`);
    setCellEdit(null);
    setRegister(await loadRegister());
  };
  const deleteClass = async (ses) => {
    const why = window.prompt(`Delete the class of ${ses.sessionDate}, period ${ses.periodNo}? All its marks are removed.\n\nReason (required):`);
    if (why === null) return;
    if (why.trim().length < 3) { toast.error('Please give a reason (at least 3 characters)'); return; }
    try { await del(`/attendance/sessions/${ses.id}`, { reason: why.trim() }); toast.success('Class deleted'); setRegister(await loadRegister()); } catch (err) { toast.error(errMsg(err)); }
  };
  // ---- printable PDFs (jspdf is loaded only when a PDF is made) ----
  const [pdfBusy, setPdfBusy] = useState('');
  const [pdfSection, setPdfSection] = useState('');
  const sections = [...new Map((classes.data || []).map((t) => [t.sectionId, t])).values()];
  const pdfLimit = form.below !== '' ? Number(form.below) : undefined;
  const makePdf = async (kind) => {
    const cls = (classes.data || []).find((t) => String(t.id) === String(form.teachingAssignmentId));
    if (kind !== 'section' && !cls) { toast.error('Select a class first'); return; }
    if (kind === 'section' && !pdfSection) { toast.error('Select a section first'); return; }
    setPdfBusy(kind);
    try {
      const pdf = await import('../../utils/pdf');
      if (kind === 'register') {
        const reg = await loadRegister();
        if (!reg.data.sessions.length) { toast.error('No classes were marked between these dates'); return; }
        pdf.registerPdf({ classLabel: classLabel(cls), from: form.from, to: form.to, register: reg, minPercent: reg.rule?.minRequiredPercent ?? 75 });
      } else {
        const params = { from: form.from, to: form.to, ...(pdfLimit ? { below: pdfLimit } : {}),
          ...(kind === 'section' ? { sectionId: pdfSection } : { teachingAssignmentId: form.teachingAssignmentId }) };
        const body = await get('/attendance/shortage', params);
        const sec = sections.find((t) => String(t.sectionId) === String(pdfSection));
        pdf.shortagePdf({
          scopeLabel: kind === 'section' ? `Section: ${sectionShort(sec)} — all ${user.role === 'lecturer' ? 'my ' : ''}subjects` : `Class: ${classLabel(cls)}`,
          from: form.from, to: form.to, rows: body.data, below: body.filter.below, ruleText: body.rule?.text,
        });
      }
    } catch (err) { toast.error(errMsg(err)); } finally { setPdfBusy(''); }
  };

  const downloadRegister = async () => {
    if (!form.teachingAssignmentId) { toast.error('Select a class first'); return; }
    setRegLoading(true);
    try {
      const body = await loadRegister();
      const { sessions, students } = body.data;
      if (!sessions.length) { toast.error('No classes were marked between these dates'); return; }
      const cls = (classes.data || []).find((t) => String(t.id) === String(form.teachingAssignmentId));
      downloadCsv(`attendance-register_${form.from}_${form.to}.csv`, [
        [cls ? classLabel(cls) : 'Class', `${form.from} to ${form.to}`],
        ['USN', 'Name', ...sessions.map((s) => `${s.sessionDate} P${s.periodNo}`), 'Classes', 'Attended', 'Absent', 'Excused', 'Percentage'],
        ...students.map((r) => [r.usn, r.fullName, ...r.statuses.map((x) => (x ? SHORT[x] : '-')),
          r.totalClasses, r.attendedClasses, r.absentClasses, r.excusedClasses, r.attendancePercentage ?? '']),
        [],
        ['P = present, A = absent, L = late, E = excused, - = no record'],
        [body.rule?.text || ''],
      ]);
    } catch (err) { toast.error(errMsg(err)); } finally { setRegLoading(false); }
  };

  // bell notification to every student below the limit, with their own %
  const [notifying, setNotifying] = useState(false);
  const lowCount = rows ? rows.filter((r) => r.attendancePercentage !== null && r.attendancePercentage < limit).length : 0;
  const notifyLow = async () => {
    if (!window.confirm(`Send a low-attendance notification to ${lowCount} student(s) below ${limit}%?`)) return;
    setNotifying(true);
    try {
      const body = await post('/attendance/report/notify-low', { teachingAssignmentId: Number(form.teachingAssignmentId), from: form.from, to: form.to, below: limit });
      toast.success(body.message || 'Students notified');
    } catch (err) { toast.error(errMsg(err)); } finally { setNotifying(false); }
  };

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
        <div className="btn-group">
          <button className="btn btn-primary" disabled={loading}>Show report</button>
          <button type="button" className="btn" disabled={regLoading} onClick={showRegister}>View / edit register</button>
          <button type="button" className="btn" disabled={regLoading} onClick={downloadRegister}>{regLoading ? 'Preparing...' : 'Download register (CSV)'}</button>
        </div>
      </form>

      <div className="card">
        <div className="row" style={{ alignItems: 'flex-end', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: '0 0 .3rem' }}><FileDown size={18} style={{ verticalAlign: -3, marginRight: 6, color: 'var(--sc-brand)' }} />Printable reports (PDF)</h2>
            <span className="muted">Uses the dates above{pdfLimit ? ` and the limit ${pdfLimit}%` : ''}; college name, signature lines and page numbers included.</span>
          </div>
          <div className="btn-group">
            <button type="button" className="btn" disabled={!!pdfBusy} onClick={() => makePdf('register')}>{pdfBusy === 'register' ? 'Making…' : 'Class register'}</button>
            <button type="button" className="btn" disabled={!!pdfBusy} onClick={() => makePdf('class')}>{pdfBusy === 'class' ? 'Making…' : 'Class shortage list'}</button>
          </div>
          <div className="btn-group" style={{ alignItems: 'flex-end' }}>
            <div><label>Section</label>
              <select value={pdfSection} onChange={(e) => setPdfSection(e.target.value)}>
                <option value="">Select section...</option>
                {sections.map((t) => <option key={t.sectionId} value={t.sectionId}>{sectionShort(t)}</option>)}
              </select></div>
            <button type="button" className="btn" disabled={!!pdfBusy} onClick={() => makePdf('section')}>{pdfBusy === 'section' ? 'Making…' : 'Section shortage list'}</button>
          </div>
        </div>
      </div>

      {loading && <div className="center"><Spinner /></div>}
      {rows && !loading && (
        <div className="card">
          <div className="row" style={{ marginBottom: '.8rem' }}>
            <h2 style={{ margin: 0 }}>{rows.length} student(s){form.below !== '' ? ` below ${form.below}%` : ''}</h2>
            <div className="btn-group">
              <button className="btn btn-sm" onClick={() => setSortAsc(!sortAsc)}>Sort: {sortAsc ? 'lowest first' : 'highest first'}</button>
              {!!rows.length && <button className="btn btn-sm" onClick={exportCsv}>Export CSV</button>}
              {lowCount > 0 && <button className="btn btn-sm btn-danger" disabled={notifying} onClick={notifyLow}>{notifying ? 'Sending...' : `Notify ${lowCount} below ${limit}%`}</button>}
            </div>
          </div>
          {rule && <div className="alert alert-info">{rule.text}. Minimum required: {rule.minRequiredPercent}%.</div>}
          {!rows.length && <Empty>No students match.</Empty>}
          {!!rows.length && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>USN</th><th>Name</th><th>Classes</th><th>Attended</th><th>Absent</th><th>Percentage</th></tr></thead>
                <tbody>
                  {sorted.map((r) => (
                    <tr key={r.studentId} className={r.attendancePercentage < minimum ? 'row-low' : ''}>
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

      {register && (
        <div className="card">
          <div className="row" style={{ marginBottom: '.6rem' }}>
            <h2 style={{ margin: 0 }}>Register {register.data.from} to {register.data.to}</h2>
            <button className="btn btn-sm" onClick={() => setRegister(null)}>Close</button>
          </div>
          <p className="muted" style={{ marginTop: 0 }}>
            Click a mark to change it{reasonRequired ? ' (admins must give a reason)' : ''}. Every change is logged in the Corrections Log.
            {user.role === 'lecturer' && register.editing?.windowDays > 0 && ` Lecturers can change classes up to ${register.editing.windowDays} days old; older ones need an admin.`}
          </p>
          {!register.data.sessions.length && <Empty>No classes were marked between these dates.</Empty>}
          {!!register.data.sessions.length && (
            <div className="table-wrap">
              <table className="register">
                <thead>
                  <tr>
                    <th>USN</th><th>Name</th>
                    {register.data.sessions.map((s) => (
                      <th key={s.id} title={s.topic || ''}>
                        {s.sessionDate.slice(5)}<br />P{s.periodNo}
                        <button className="btn-icon" title="Delete this class" onClick={() => deleteClass(s)}>✕</button>
                      </th>
                    ))}
                    <th>%</th>
                  </tr>
                </thead>
                <tbody>
                  {register.data.students.map((r) => (
                    <tr key={r.studentId} className={r.attendancePercentage !== null && r.attendancePercentage < minimum ? 'row-low' : ''}>
                      <td>{r.usn}</td><td>{r.fullName}</td>
                      {r.statuses.map((st, i) => (
                        <td key={register.data.sessions[i].id}>
                          {st
                            ? <button className="btn-cell" onClick={() => setCellEdit({ session: register.data.sessions[i], student: r, status: st })}><Badge value={st}>{SHORT[st]}</Badge></button>
                            : <span className="muted">-</span>}
                        </td>
                      ))}
                      <td>{r.attendancePercentage ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <FormModal open={!!cellEdit} title={cellEdit ? `${cellEdit.student.fullName} — ${cellEdit.session.sessionDate}, period ${cellEdit.session.periodNo}` : ''}
        initial={{ status: cellEdit?.status }} submitLabel="Save change" onSubmit={saveCell} onClose={() => setCellEdit(null)}
        fields={[
          { name: 'status', label: 'Status', type: 'select', required: true, options: ['present', 'absent', 'late', 'excused'].map((x) => ({ value: x, label: x })) },
          { name: 'reason', label: reasonRequired ? 'Reason' : 'Reason (optional)', required: reasonRequired, placeholder: 'e.g. Marked wrongly' },
        ]} />
    </>
  );
}
