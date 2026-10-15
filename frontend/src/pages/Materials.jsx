import { useMemo, useState } from 'react';
import api, { del, get, put } from '../api/client';
import useFetch from '../hooks/useFetch';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import FormModal from '../components/FormModal';
import FileButton from '../components/FileButton';
import { Async, Badge, Empty, PageHeader } from '../components/ui';
import { fmtDate, fmtSize } from '../utils/format';
import { classLabel, errMsg, toFormData } from '../utils/helpers';

// Student: view / download. Lecturer: upload + hide. Admin: hide / show.
export default function Materials() {
  const { user } = useAuth();
  const toast = useToast();
  const isLecturer = user.role === 'lecturer';
  const canManage = user.role !== 'student';
  const [filters, setFilters] = useState({ type: '', q: '', subjectId: '' });
  const [uploading, setUploading] = useState(false);

  const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
  const f = useFetch(() => get('/materials', params), [filters.type, filters.q, filters.subjectId]);
  const classes = useFetch(() => (isLecturer ? get('/teaching') : Promise.resolve({ data: [] })), []);

  // subjects list for the filter, built from the loaded materials
  const subjects = useMemo(() => {
    const map = new Map();
    (f.data || []).forEach((m) => map.set(m.subjectId, `${m.subjectCode} - ${m.subjectName}`));
    return [...map.entries()];
  }, [f.data]);

  // group by subject
  const groups = useMemo(() => {
    const g = {};
    (f.data || []).forEach((m) => { (g[`${m.subjectCode} - ${m.subjectName}`] ||= []).push(m); });
    return Object.entries(g);
  }, [f.data]);

  const fields = [
    { name: 'teachingAssignmentId', label: 'Class', type: 'select', required: true, options: (classes.data || []).map((t) => ({ value: t.id, label: classLabel(t) })) },
    { name: 'title', label: 'Title', required: true },
    { name: 'unitNo', label: 'Unit / module no. (optional)', type: 'number', min: 1, half: true },
    { name: 'description', label: 'Description (optional)', half: true },
    { name: 'file', label: 'File (PDF, PPT, PPTX, DOC, DOCX - max 25 MB)', type: 'file', accept: '.pdf,.ppt,.pptx,.doc,.docx', required: true },
  ];

  const upload = async (v) => {
    await api.post('/materials', toFormData(v));
    toast.success('Material uploaded. Students have been notified.');
    setUploading(false);
    f.reload();
  };

  const hide = async (id) => {
    if (!window.confirm('Hide this material from students?')) return;
    try { await del(`/materials/${id}`); toast.success('Hidden from students'); f.reload(); } catch (e) { toast.error(errMsg(e)); }
  };
  const show = async (id) => {
    try { await put(`/materials/${id}`, { isActive: true }); toast.success('Visible to students again'); f.reload(); } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <>
      <PageHeader title="Study Materials" subtitle="Notes, slides and documents uploaded by lecturers">
        {isLecturer && <button className="btn btn-primary" onClick={() => setUploading(true)}>+ Upload material</button>}
      </PageHeader>

      <div className="filters">
        <div><label>Search title</label><input type="text" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} /></div>
        <div><label>Type</label>
          <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
            <option value="">All</option><option value="pdf">PDF</option><option value="ppt">PPT</option><option value="doc">DOC</option>
          </select></div>
        <div><label>Subject</label>
          <select value={filters.subjectId} onChange={(e) => setFilters({ ...filters, subjectId: e.target.value })}>
            <option value="">All</option>{subjects.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select></div>
      </div>

      <Async f={f}>
        {!groups.length && <div className="card"><Empty>No study materials found.</Empty></div>}
        {groups.map(([subject, items]) => (
          <div key={subject} className="card">
            <h2>{subject}</h2>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Unit</th><th>Title</th><th>Type</th><th>File</th><th>Uploaded</th><th /></tr></thead>
                <tbody>
                  {items.map((m) => (
                    <tr key={m.id}>
                      <td>{m.unitNo ?? '-'}</td>
                      <td><strong>{m.title}</strong>{m.description && <div className="muted">{m.description}</div>}
                        {canManage && <div className="muted">Section {m.sectionName}</div>}</td>
                      <td><Badge value={m.materialType} tone="blue">{m.materialType.toUpperCase()}</Badge></td>
                      <td>{m.originalName}<div className="muted">{fmtSize(m.sizeBytes)}</div></td>
                      <td>{fmtDate(m.createdAt)}<div className="muted">{m.uploadedByName}</div></td>
                      <td>
                        <span className="btn-group">
                          <FileButton fileId={m.fileId} name={m.originalName} extension={m.extension} />
                          {canManage && !m.isActive && <button className="btn btn-sm" onClick={() => show(m.id)}>Show</button>}
                          {canManage && !!m.isActive && <button className="btn btn-sm btn-danger" onClick={() => hide(m.id)}>Hide</button>}
                        </span>
                        {canManage && !m.isActive && <div><Badge value="inactive">Hidden</Badge></div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </Async>

      <FormModal open={uploading} title="Upload study material" fields={fields} submitLabel="Upload" onSubmit={upload} onClose={() => setUploading(false)} />
    </>
  );
}
