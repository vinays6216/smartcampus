import { useState } from 'react';
import { get, patch, post, put } from '../../api/client';
import useFetch from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import FormModal from '../../components/FormModal';
import Modal from '../../components/Modal';
import { Async, Badge, Empty, PageHeader, Pagination } from '../../components/ui';
import { clean, errMsg, sectionLabel } from '../../utils/helpers';

const STATUSES = ['active', 'suspended', 'dropped', 'passed_out'];

export default function Students() {
  const toast = useToast();
  const [filters, setFilters] = useState({ q: '', programId: '', sectionId: '', status: '' });
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(null);     // null | { mode: 'create' } | { mode: 'edit', student }
  const [secret, setSecret] = useState(null); // temporary password shown once
  const limit = 15;

  const f = useFetch(() => get('/admin/students', { ...clean(filters), page, limit }), [filters, page]);
  const programs = useFetch(() => get('/academic/programs'), []);
  const sections = useFetch(() => get('/academic/sections'), []);

  const programOptions = (programs.data || []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }));
  const sectionsOf = (programId) => (sections.data || []).filter((s) => !programId || String(s.programId) === String(programId))
    .map((s) => ({ value: s.id, label: sectionLabel(s) }));

  const isCreate = form?.mode === 'create';
  const fields = [
    { name: 'fullName', label: 'Full name', required: true },
    { name: 'usn', label: 'USN', required: true, half: true },
    { name: 'email', label: 'Email', type: 'email', required: true, half: true },
    { name: 'phone', label: 'Phone', half: true },
    { name: 'password', label: 'Password (leave empty to auto-generate)', type: 'password', half: true, show: () => isCreate },
    { name: 'programId', label: 'Program', type: 'select', required: true, half: true, options: programOptions },
    { name: 'sectionId', label: 'Section', type: 'select', required: true, half: true, options: (v) => sectionsOf(v.programId) },
    { name: 'admissionYear', label: 'Admission year', type: 'number', min: 2000, max: 2100, half: true },
    { name: 'dateOfBirth', label: 'Date of birth', type: 'date', half: true },
    { name: 'gender', label: 'Gender', type: 'select', half: true, options: ['male', 'female', 'other'].map((v) => ({ value: v, label: v })) },
    { name: 'address', label: 'Address' },
    { name: 'guardianName', label: 'Guardian name', half: true },
    { name: 'guardianPhone', label: 'Guardian phone', half: true },
  ];

  const save = async (v) => {
    if (isCreate) {
      const res = await post('/admin/students', clean(v));
      setSecret({ name: v.fullName, password: res.data.temporaryPassword });
      toast.success('Student created');
    } else {
      const { password, ...rest } = v; // eslint-disable-line no-unused-vars
      await put(`/admin/students/${form.student.id}`, clean(rest));
      toast.success('Student updated');
    }
    setForm(null);
    f.reload();
  };

  const openEdit = async (row) => {
    try { setForm({ mode: 'edit', student: (await get(`/admin/students/${row.id}`)).data }); } catch (e) { toast.error(errMsg(e)); }
  };

  const changeStatus = async (row, status) => {
    try { await patch(`/admin/students/${row.id}/status`, { status }); toast.success('Status updated'); f.reload(); } catch (e) { toast.error(errMsg(e)); }
  };

  const resetPassword = async (row) => {
    if (!window.confirm(`Reset the password of ${row.fullName}?`)) return;
    try {
      const res = await post(`/admin/users/${row.userId}/reset-password`);
      setSecret({ name: row.fullName, password: res.data.temporaryPassword });
    } catch (e) { toast.error(errMsg(e)); }
  };

  const setFilter = (k) => (e) => { setFilters({ ...filters, [k]: e.target.value }); setPage(1); };

  return (
    <>
      <PageHeader title="Students" subtitle="View, add and edit student accounts">
        <button className="btn btn-primary" onClick={() => setForm({ mode: 'create' })}>+ Add student</button>
      </PageHeader>

      <div className="card filters">
        <div><label>Search</label><input type="text" placeholder="Name, USN or email" value={filters.q} onChange={setFilter('q')} /></div>
        <div><label>Program</label>
          <select value={filters.programId} onChange={setFilter('programId')}><option value="">All</option>
            {programOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
        <div><label>Section</label>
          <select value={filters.sectionId} onChange={setFilter('sectionId')}><option value="">All</option>
            {sectionsOf(filters.programId).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
        <div><label>Status</label>
          <select value={filters.status} onChange={setFilter('status')}><option value="">All</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
      </div>

      <div className="card">
        <Async f={f}>
          {!f.data?.length && <Empty>No students found.</Empty>}
          {!!f.data?.length && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>USN</th><th>Name</th><th>Email</th><th>Class</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {f.data.map((s) => (
                    <tr key={s.id}>
                      <td>{s.usn}</td>
                      <td><strong>{s.fullName}</strong><div className="muted">{s.phone}</div></td>
                      <td>{s.email}</td>
                      <td>{s.programCode} Sem {s.semesterNo} Sec {s.sectionName}</td>
                      <td>
                        <select value={s.status} onChange={(e) => changeStatus(s, e.target.value)}>
                          {STATUSES.map((x) => <option key={x} value={x}>{x.replace('_', ' ')}</option>)}
                        </select>
                      </td>
                      <td><span className="btn-group">
                        <button className="btn btn-sm" onClick={() => openEdit(s)}>Edit</button>
                        <button className="btn btn-sm" onClick={() => resetPassword(s)}>Reset password</button>
                      </span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={page} limit={limit} total={f.body?.pagination?.total || 0} onChange={setPage} />
        </Async>
      </div>

      <FormModal
        open={!!form} wide
        title={isCreate ? 'Add student' : 'Edit student'}
        fields={fields}
        initial={form?.student || {}}
        submitLabel={isCreate ? 'Create student' : 'Save changes'}
        onSubmit={save}
        onClose={() => setForm(null)}
      />

      <Modal open={!!secret} title="Temporary password" onClose={() => setSecret(null)}>
        <p>Give this password to <strong>{secret?.name}</strong>. It is shown only once, and they must change it at first login.</p>
        <div className="alert alert-info" style={{ fontSize: '1.3rem', textAlign: 'center', letterSpacing: 1 }}><code>{secret?.password}</code></div>
        <div className="form-actions"><button className="btn btn-primary" onClick={() => setSecret(null)}>Done</button></div>
      </Modal>
    </>
  );
}
