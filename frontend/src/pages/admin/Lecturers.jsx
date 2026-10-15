import { useState } from 'react';
import { get, patch, post, put } from '../../api/client';
import useFetch from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import FormModal from '../../components/FormModal';
import Modal from '../../components/Modal';
import { Async, Empty, PageHeader, Pagination } from '../../components/ui';
import { clean, errMsg } from '../../utils/helpers';

const STATUSES = ['active', 'inactive', 'suspended'];

export default function Lecturers() {
  const toast = useToast();
  const [filters, setFilters] = useState({ q: '', departmentId: '', status: '' });
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(null);
  const [secret, setSecret] = useState(null);
  const limit = 15;

  const f = useFetch(() => get('/admin/lecturers', { ...clean(filters), page, limit }), [filters, page]);
  const departments = useFetch(() => get('/academic/departments'), []);
  const deptOptions = (departments.data || []).map((d) => ({ value: d.id, label: d.name }));

  const isCreate = form?.mode === 'create';
  const fields = [
    { name: 'fullName', label: 'Full name', required: true },
    { name: 'employeeCode', label: 'Employee code', required: true, half: true },
    { name: 'email', label: 'Email', type: 'email', required: true, half: true },
    { name: 'phone', label: 'Phone', half: true },
    { name: 'password', label: 'Password (leave empty to auto-generate)', type: 'password', half: true, show: () => isCreate },
    { name: 'departmentId', label: 'Department', type: 'select', required: true, half: true, options: deptOptions },
    { name: 'designation', label: 'Designation', half: true },
    { name: 'qualification', label: 'Qualification', half: true },
    { name: 'joinedOn', label: 'Joined on', type: 'date', half: true },
  ];

  const save = async (v) => {
    if (isCreate) {
      const res = await post('/admin/lecturers', clean(v));
      setSecret({ name: v.fullName, password: res.data.temporaryPassword });
      toast.success('Lecturer created');
    } else {
      const { password, ...rest } = v; // eslint-disable-line no-unused-vars
      await put(`/admin/lecturers/${form.lecturer.id}`, clean(rest));
      toast.success('Lecturer updated');
    }
    setForm(null);
    f.reload();
  };

  const openEdit = async (row) => {
    try { setForm({ mode: 'edit', lecturer: (await get(`/admin/lecturers/${row.id}`)).data }); } catch (e) { toast.error(errMsg(e)); }
  };

  const changeStatus = async (row, status) => {
    try { await patch(`/admin/lecturers/${row.id}/status`, { status }); toast.success('Status updated'); f.reload(); } catch (e) { toast.error(errMsg(e)); }
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
      <PageHeader title="Lecturers" subtitle="View, add and edit staff accounts">
        <button className="btn btn-primary" onClick={() => setForm({ mode: 'create' })}>+ Add lecturer</button>
      </PageHeader>

      <div className="card filters">
        <div><label>Search</label><input type="text" placeholder="Name, code or email" value={filters.q} onChange={setFilter('q')} /></div>
        <div><label>Department</label>
          <select value={filters.departmentId} onChange={setFilter('departmentId')}><option value="">All</option>
            {deptOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></div>
        <div><label>Status</label>
          <select value={filters.status} onChange={setFilter('status')}><option value="">All</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
      </div>

      <div className="card">
        <Async f={f}>
          {!f.data?.length && <Empty>No lecturers found.</Empty>}
          {!!f.data?.length && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Code</th><th>Name</th><th>Email</th><th>Department</th><th>Status</th><th /></tr></thead>
                <tbody>
                  {f.data.map((l) => (
                    <tr key={l.id}>
                      <td>{l.employeeCode}</td>
                      <td><strong>{l.fullName}</strong><div className="muted">{l.designation}</div></td>
                      <td>{l.email}<div className="muted">{l.phone}</div></td>
                      <td>{l.departmentName}</td>
                      <td>
                        <select value={l.status} onChange={(e) => changeStatus(l, e.target.value)}>
                          {STATUSES.map((x) => <option key={x} value={x}>{x}</option>)}
                        </select>
                      </td>
                      <td><span className="btn-group">
                        <button className="btn btn-sm" onClick={() => openEdit(l)}>Edit</button>
                        <button className="btn btn-sm" onClick={() => resetPassword(l)}>Reset password</button>
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
        title={isCreate ? 'Add lecturer' : 'Edit lecturer'}
        fields={fields}
        initial={form?.lecturer || {}}
        submitLabel={isCreate ? 'Create lecturer' : 'Save changes'}
        onSubmit={save}
        onClose={() => setForm(null)}
      >
        {!isCreate && form?.lecturer?.classes?.length > 0 && (
          <div className="full">
            <strong>Teaching:</strong>
            <ul>{form.lecturer.classes.map((c) => <li key={c.teachingAssignmentId}>{c.subjectCode} {c.subjectName} - Sem {c.semesterNo} Sec {c.sectionName}</li>)}</ul>
          </div>
        )}
      </FormModal>

      <Modal open={!!secret} title="Temporary password" onClose={() => setSecret(null)}>
        <p>Give this password to <strong>{secret?.name}</strong>. It is shown only once, and they must change it at first login.</p>
        <div className="alert alert-info" style={{ fontSize: '1.3rem', textAlign: 'center', letterSpacing: 1 }}><code>{secret?.password}</code></div>
        <div className="form-actions"><button className="btn btn-primary" onClick={() => setSecret(null)}>Done</button></div>
      </Modal>
    </>
  );
}
