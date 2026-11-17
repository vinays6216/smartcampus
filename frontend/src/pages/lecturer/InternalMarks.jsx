import { useEffect, useState } from 'react';
import { del, get, patch, post, put } from '../../api/client';
import useFetch from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import FormModal from '../../components/FormModal';
import { Async, Badge, Empty, PageHeader, Tabs } from '../../components/ui';
import { fmtDate } from '../../utils/format';
import { classLabel, downloadCsv, errMsg } from '../../utils/helpers';

const KINDS = [['test', 'Test'], ['quiz', 'Quiz'], ['assignment', 'Assignment'], ['lab', 'Lab'], ['other', 'Other']];

// Lecturer / admin: assessments per class, marks entry, publish, class summary + CSV.
export default function InternalMarks() {
  const toast = useToast();
  const classes = useFetch(() => get('/teaching'), []);
  const [taId, setTaId] = useState('');
  const [tab, setTab] = useState('assessments');
  const list = useFetch(() => (taId ? get('/marks/assessments', { teachingAssignmentId: taId }) : Promise.resolve(null)), [taId]);
  const summary = useFetch(() => (taId && tab === 'summary' ? get(`/marks/class/${taId}`) : Promise.resolve(null)), [taId, tab]);
  const [form, setForm] = useState(null); // { mode: 'create' } | { mode: 'edit', a }
  const [entering, setEntering] = useState(null); // assessment id

  const cls = (classes.data || []).find((t) => String(t.id) === String(taId));
  const fields = [
    { name: 'title', label: 'Title', required: true, placeholder: 'e.g. IA-1, Quiz 2' },
    { name: 'kind', label: 'Type', type: 'select', required: true, half: true, default: 'test', options: KINDS.map(([value, label]) => ({ value, label })) },
    { name: 'maxMarks', label: 'Maximum marks', type: 'number', required: true, half: true, min: 1, step: 0.5 },
    { name: 'heldOn', label: 'Held on (optional)', type: 'date' },
  ];
  const save = async (v) => {
    const body = { title: v.title, kind: v.kind, maxMarks: Number(v.maxMarks), ...(v.heldOn ? { heldOn: v.heldOn } : {}) };
    if (form.mode === 'create') await post('/marks/assessments', { teachingAssignmentId: Number(taId), ...body });
    else await put(`/marks/assessments/${form.a.id}`, { ...body, heldOn: v.heldOn || '' });
    toast.success('Saved');
    setForm(null);
    list.reload();
  };
  const remove = async (a) => {
    if (!window.confirm(`Delete "${a.title}" and all its marks?`)) return;
    try { await del(`/marks/assessments/${a.id}`); toast.success('Deleted'); list.reload(); } catch (e) { toast.error(errMsg(e)); }
  };
  const togglePublish = async (a) => {
    try { const b = await patch(`/marks/assessments/${a.id}/publish`, { published: !a.isPublished }); toast.success(b.message); list.reload(); } catch (e) { toast.error(errMsg(e)); }
  };

  const exportCsv = () => {
    const d = summary.data;
    downloadCsv(`marks_${cls ? cls.subjectCode : taId}.csv`, [
      [cls ? classLabel(cls) : 'Class'],
      ['USN', 'Name', ...d.assessments.map((a) => `${a.title} (/${Number(a.maxMarks)})`), `Total (/${d.maxTotal})`, '%'],
      ...d.students.map((s) => [s.usn, s.fullName, ...s.marks.map((m) => (m === null ? '' : m)), s.total, s.percentage ?? '']),
    ]);
  };

  return (
    <>
      <PageHeader title="Internal Marks" subtitle="Create tests and quizzes, enter marks, then publish them to students" />
      <div className="card filters">
        <div style={{ minWidth: 320 }}><label>Class</label>
          <select value={taId} onChange={(e) => { setTaId(e.target.value); setEntering(null); }}>
            <option value="">Select class...</option>
            {(classes.data || []).map((t) => <option key={t.id} value={t.id}>{classLabel(t)}</option>)}
          </select></div>
        {taId && <button className="btn btn-primary" onClick={() => setForm({ mode: 'create' })}>+ New assessment</button>}
      </div>

      {!taId && <div className="card"><Empty>Select a class.</Empty></div>}
      {taId && <Tabs items={[{ key: 'assessments', label: 'Assessments' }, { key: 'summary', label: 'Class summary' }]} active={tab} onChange={(t) => { setTab(t); setEntering(null); }} />}

      {taId && tab === 'assessments' && (
        <div className="card">
          <Async f={list}>
            {!list.data?.length && <Empty>No assessments yet. Create one with “New assessment”.</Empty>}
            {!!list.data?.length && (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Title</th><th>Type</th><th>Held on</th><th>Max</th><th>Entered</th><th>Average</th><th>Status</th><th /></tr></thead>
                  <tbody>
                    {list.data.map((a) => (
                      <tr key={a.id}>
                        <td><strong>{a.title}</strong></td>
                        <td>{KINDS.find(([k]) => k === a.kind)?.[1]}</td>
                        <td>{a.heldOn ? fmtDate(a.heldOn) : '-'}</td>
                        <td>{Number(a.maxMarks)}</td>
                        <td>{a.entered}{a.absent ? <span className="muted"> ({a.absent} absent)</span> : ''}</td>
                        <td>{a.average ?? '-'}</td>
                        <td><Badge value={a.isPublished ? 'published' : 'draft'} tone={a.isPublished ? 'green' : 'gray'} /></td>
                        <td>
                          <div className="btn-group">
                            <button className="btn btn-sm btn-primary" onClick={() => setEntering(a.id)}>Enter marks</button>
                            <button className="btn btn-sm" onClick={() => togglePublish(a)}>{a.isPublished ? 'Unpublish' : 'Publish'}</button>
                            <button className="btn btn-sm" onClick={() => setForm({ mode: 'edit', a })}>Edit</button>
                            <button className="btn btn-sm btn-danger" onClick={() => remove(a)}>Delete</button>
                          </div>
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

      {taId && tab === 'assessments' && entering && <MarksEntry id={entering} onDone={() => { setEntering(null); list.reload(); }} />}

      {taId && tab === 'summary' && (
        <div className="card">
          <Async f={summary}>
            {!summary.data?.assessments?.length && <Empty>No assessments yet.</Empty>}
            {!!summary.data?.assessments?.length && (
              <>
                <div className="row" style={{ marginBottom: '.6rem' }}>
                  <span className="muted">Totals out of {summary.data.maxTotal}. AB = absent. Drafts are included here but not shown to students.</span>
                  <button className="btn btn-sm" onClick={exportCsv}>Export CSV</button>
                </div>
                <div className="table-wrap">
                  <table className="register">
                    <thead><tr><th>USN</th><th>Name</th>{summary.data.assessments.map((a) => <th key={a.id}>{a.title}<br /><span className="muted">/{Number(a.maxMarks)}</span></th>)}<th>Total</th><th>%</th></tr></thead>
                    <tbody>
                      {summary.data.students.map((s) => (
                        <tr key={s.studentId}>
                          <td>{s.usn}</td><td>{s.fullName}</td>
                          {s.marks.map((m, i) => <td key={summary.data.assessments[i].id}>{m === null ? <span className="muted">-</span> : m}</td>)}
                          <td><strong>{s.total}</strong></td><td>{s.percentage ?? '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Async>
        </div>
      )}

      <FormModal open={!!form} title={form?.mode === 'create' ? 'New assessment' : `Edit ${form?.a?.title}`} fields={fields}
        initial={form?.mode === 'edit' ? { title: form.a.title, kind: form.a.kind, maxMarks: Number(form.a.maxMarks), heldOn: form.a.heldOn || '' } : {}}
        onSubmit={save} onClose={() => setForm(null)} />
    </>
  );
}

// Marks entry table for one assessment.
function MarksEntry({ id, onDone }) {
  const toast = useToast();
  const f = useFetch(() => get(`/marks/assessments/${id}`), [id]);
  const [rows, setRows] = useState({});
  const [saving, setSaving] = useState(false);
  const a = f.data;

  useEffect(() => {
    if (!a) return;
    setRows(Object.fromEntries(a.students.map((s) => [s.studentId, {
      marks: s.marks === null ? '' : String(Number(s.marks)), absent: !!s.isAbsent, remarks: s.remarks || '',
    }])));
  }, [a]);

  const set = (sid, k, v) => setRows((r) => ({ ...r, [sid]: { ...r[sid], [k]: v } }));
  const max = a ? Number(a.maxMarks) : 0;
  const bad = Object.values(rows).some((r) => !r.absent && r.marks !== '' && (Number(r.marks) < 0 || Number(r.marks) > max || Number.isNaN(Number(r.marks))));

  const save = async () => {
    setSaving(true);
    try {
      const marks = Object.entries(rows).map(([sid, r]) => ({
        studentId: Number(sid), absent: r.absent, marks: r.absent || r.marks === '' ? null : Number(r.marks), ...(r.remarks ? { remarks: r.remarks } : {}),
      }));
      const b = await put(`/marks/assessments/${id}/marks`, { marks });
      toast.success(b.message);
      onDone();
    } catch (e) { toast.error(errMsg(e)); } finally { setSaving(false); }
  };

  return (
    <div className="card">
      <Async f={f}>
        {a && (
          <>
            <div className="row" style={{ marginBottom: '.6rem' }}>
              <h2 style={{ margin: 0 }}>{a.subjectCode} · {a.title} <span className="muted">(out of {max})</span></h2>
              <button className="btn btn-sm" onClick={onDone}>Close</button>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>USN</th><th>Name</th><th>Marks</th><th>Absent</th><th>Remarks</th></tr></thead>
                <tbody>
                  {a.students.map((s) => {
                    const r = rows[s.studentId] || { marks: '', absent: false, remarks: '' };
                    const wrong = !r.absent && r.marks !== '' && (Number(r.marks) > max || Number(r.marks) < 0);
                    return (
                      <tr key={s.studentId} className={wrong ? 'row-low' : ''}>
                        <td>{s.usn}</td><td>{s.fullName}</td>
                        <td><input type="number" min={0} max={max} step="0.5" style={{ width: 100 }} disabled={r.absent} value={r.absent ? '' : r.marks} onChange={(e) => set(s.studentId, 'marks', e.target.value)} /></td>
                        <td><input type="checkbox" checked={r.absent} onChange={(e) => set(s.studentId, 'absent', e.target.checked)} /></td>
                        <td><input type="text" placeholder="optional" value={r.remarks} onChange={(e) => set(s.studentId, 'remarks', e.target.value)} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="row" style={{ marginTop: '1rem' }}>
              <span className={bad ? 'text-red' : 'muted'}>{bad ? `Marks must be between 0 and ${max}.` : 'Leave a box empty if not entered yet.'}</span>
              <button className="btn btn-primary" disabled={saving || bad} onClick={save}>{saving ? 'Saving...' : 'Save marks'}</button>
            </div>
          </>
        )}
      </Async>
    </div>
  );
}
