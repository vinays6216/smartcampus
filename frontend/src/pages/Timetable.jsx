import { useState } from 'react';
import { get, patch } from '../api/client';
import api from '../api/client';
import useFetch from '../hooks/useFetch';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import FormModal from '../components/FormModal';
import FileButton from '../components/FileButton';
import { Async, Badge, Empty, PageHeader } from '../components/ui';
import { fmtDate, fmtSize } from '../utils/format';
import { errMsg, sectionLabel, toFormData } from '../utils/helpers';

// Student / lecturer: view. Admin: upload and manage.
export default function Timetable() {
  const { user } = useAuth();
  const toast = useToast();
  const isAdmin = user.role === 'admin';
  const [sectionId, setSectionId] = useState('');
  const [uploading, setUploading] = useState(false);

  const f = useFetch(() => get('/timetables', isAdmin && sectionId ? { sectionId } : undefined), [sectionId]);
  const sections = useFetch(() => (isAdmin ? get('/academic/sections') : Promise.resolve({ data: [] })), []);
  const sectionOptions = (sections.data || []).map((s) => ({ value: s.id, label: sectionLabel(s) }));

  const fields = [
    { name: 'sectionId', label: 'Section', type: 'select', required: true, options: sectionOptions },
    { name: 'title', label: 'Title', required: true, placeholder: 'e.g. Semester 1 Time Table' },
    { name: 'effectiveFrom', label: 'Effective from', type: 'date', required: true, half: true },
    { name: 'effectiveTo', label: 'Effective to (optional)', type: 'date', half: true },
    { name: 'file', label: 'File (PDF, PNG, JPG - max 10 MB)', type: 'file', accept: '.pdf,.png,.jpg,.jpeg', required: true },
  ];

  const upload = async (v) => {
    await api.post('/timetables', toFormData(v));
    toast.success('Time table uploaded. Students and lecturers have been notified.');
    setUploading(false);
    f.reload();
  };

  const deactivate = async (id) => {
    try { await patch(`/timetables/${id}/deactivate`); toast.success('Time table hidden'); f.reload(); } catch (e) { toast.error(errMsg(e)); }
  };

  return (
    <>
      <PageHeader title="Time Table" subtitle={isAdmin ? 'Upload and manage section time tables' : 'Your current time table'}>
        {isAdmin && (
          <>
            <select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              <option value="">All sections</option>
              {sectionOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button className="btn btn-primary" onClick={() => setUploading(true)}>+ Upload time table</button>
          </>
        )}
      </PageHeader>

      <Async f={f}>
        {!f.data?.length && <div className="card"><Empty>No time table has been uploaded yet.</Empty></div>}
        {f.data?.map((t) => (
          <div key={t.id} className="card">
            <div className="row">
              <div>
                <h2 style={{ marginBottom: '.2rem' }}>{t.title}</h2>
                <div className="muted">
                  {t.programCode} Sem {t.semesterNo} Section {t.sectionName} - from {fmtDate(t.effectiveFrom)}{t.effectiveTo && ` to ${fmtDate(t.effectiveTo)}`}
                  {' '}- {t.originalName} ({fmtSize(t.sizeBytes)})
                </div>
              </div>
              <div className="btn-group">
                <Badge value={t.isActive ? 'active' : 'inactive'} />
                <FileButton fileId={t.fileId} name={t.originalName} extension={t.extension} />
                {isAdmin && t.isActive && <button className="btn btn-sm" onClick={() => deactivate(t.id)}>Deactivate</button>}
              </div>
            </div>
          </div>
        ))}
      </Async>

      <FormModal open={uploading} title="Upload time table" fields={fields} submitLabel="Upload" onSubmit={upload} onClose={() => setUploading(false)} />
    </>
  );
}
