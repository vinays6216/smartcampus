import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { del, get, post, put } from '../../api/client';
import useFetch from '../../hooks/useFetch';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import FormModal from '../../components/FormModal';
import { Async, Badge, Empty, PageHeader } from '../../components/ui';
import { fmtDateTime, toInputDateTime } from '../../utils/format';
import { classLabel, clean, errMsg, toFormData } from '../../utils/helpers';

// Lecturer: create, publish, close, grade. Admin: see everything, close or delete.
export default function ManageAssignments() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const isLecturer = user.role === 'lecturer';
  const [status, setStatus] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);

  const f = useFetch(() => get('/assignments/manage', status ? { status } : undefined), [status]);
  const classes = useFetch(() => (isLecturer ? get('/teaching') : Promise.resolve({ data: [] })), []);

  const createFields = [
    { name: 'teachingAssignmentId', label: 'Class', type: 'select', required: true, options: (classes.data || []).map((t) => ({ value: t.id, label: classLabel(t) })) },
    { name: 'title', label: 'Title', required: true },
    { name: 'description', label: 'Description / instructions', type: 'textarea' },
    { name: 'deadline', label: 'Deadline', type: 'datetime-local', required: true, half: true, hint: 'Students see this as an alert.' },
    { name: 'maxMarks', label: 'Max marks (optional)', type: 'number', min: 1, half: true },
    { name: 'allowManual', type: 'checkbox', label: '', checkLabel: 'Allow "submitted manually" button', default: true },
    { name: 'allowOnline', type: 'checkbox', label: '', checkLabel: 'Allow online submission (link / PDF)', default: true },
    { name: 'allowLate', type: 'checkbox', label: '', checkLabel: 'Accept late submissions', default: false },
    { name: 'files', label: 'Attachments (optional, up to 5)', type: 'file', multiple: true },
  ];

  const editFields = createFields.filter((x) => !['teachingAssignmentId', 'files'].includes(x.name));

  const create = async (v) => {
    await api.post('/assignments/manage', toFormData(v));
    toast.success('Draft created. Publish it when you are ready.');
    setCreating(false);
    f.reload();
  };

  const openEdit = async (row) => {
    try {
      const a = (await get(`/assignments/manage/${row.id}`)).data;
      setEditing({ ...a, deadline: toInputDateTime(a.deadline), allowOnline: !!a.allowOnline, allowManual: !!a.allowManual, allowLate: !!a.allowLate });
    } catch (e) { toast.error(errMsg(e)); }
  };

  const saveEdit = async (v) => {
    await put(`/assignments/manage/${editing.id}`, clean({
      title: v.title, description: v.description, maxMarks: v.maxMarks, deadline: v.deadline,
      allowOnline: v.allowOnline, allowManual: v.allowManual, allowLate: v.allowLate,
    }));
    toast.success('Assignment updated');
    setEditing(null);
    f.reload();
  };

  const act = async (fn, ok) => { try { await fn(); toast.success(ok); f.reload(); } catch (e) { toast.error(errMsg(e)); } };
  const publish = (a) => window.confirm(`Publish "${a.title}"? All students of the section will be notified.`) &&
    act(() => post(`/assignments/manage/${a.id}/publish`), 'Published and students notified');
  const close = (a) => window.confirm('Close this assignment? Students can no longer submit.') &&
    act(() => post(`/assignments/manage/${a.id}/close`), 'Assignment closed');
  const remove = (a) => window.confirm('Delete this draft?') && act(() => del(`/assignments/manage/${a.id}`), 'Draft deleted');

  return (
    <>
      <PageHeader title="Assignments" subtitle={isLecturer ? 'Post assignments with deadlines and check submissions' : 'All assignments across lecturers'}>
        {isLecturer && <button className="btn btn-primary" onClick={() => setCreating(true)}>+ New assignment</button>}
      </PageHeader>

      <div className="tabs">
        {['', 'draft', 'published', 'closed'].map((s) => (
          <button key={s || 'all'} className={`tab ${status === s ? 'active' : ''}`} onClick={() => setStatus(s)}>{s || 'All'}</button>
        ))}
      </div>

      <div className="card">
        <Async f={f}>
          {!f.data?.length && <Empty>No assignments.</Empty>}
          {!!f.data?.length && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Title</th><th>Class</th>{!isLecturer && <th>Lecturer</th>}<th>Deadline</th><th>Status</th><th>Submitted</th><th /></tr></thead>
                <tbody>
                  {f.data.map((a) => (
                    <tr key={a.id}>
                      <td><strong>{a.title}</strong></td>
                      <td>{a.subjectCode}<div className="muted">Section {a.sectionName}</div></td>
                      {!isLecturer && <td>{a.lecturerName}</td>}
                      <td>{fmtDateTime(a.deadline)}</td>
                      <td><Badge value={a.status} /></td>
                      <td>{a.submittedCount} / {a.totalStudents}</td>
                      <td>
                        <span className="btn-group">
                          {a.status !== 'draft' && <button className="btn btn-sm" onClick={() => navigate(`/manage-assignments/${a.id}/submissions`)}>Submissions</button>}
                          {a.status === 'draft' && isLecturer && <button className="btn btn-sm btn-success" onClick={() => publish(a)}>Publish</button>}
                          {a.status !== 'closed' && <button className="btn btn-sm" onClick={() => openEdit(a)}>Edit</button>}
                          {a.status === 'published' && <button className="btn btn-sm" onClick={() => close(a)}>Close</button>}
                          {a.status === 'draft' && <button className="btn btn-sm btn-danger" onClick={() => remove(a)}>Delete</button>}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Async>
      </div>

      <FormModal open={creating} title="New assignment" wide fields={createFields} submitLabel="Save as draft" onSubmit={create} onClose={() => setCreating(false)} />
      <FormModal open={!!editing} title="Edit assignment" wide fields={editFields} initial={editing || {}} onSubmit={saveEdit} onClose={() => setEditing(null)} />
    </>
  );
}
