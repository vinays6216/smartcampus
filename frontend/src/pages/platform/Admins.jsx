import { useState } from 'react';
import { get, patch, post, put } from '../../api/client';
import useFetch from '../../hooks/useFetch';
import { useToast } from '../../context/ToastContext';
import FormModal from '../../components/FormModal';
import Modal from '../../components/Modal';
import { Async, Badge, Empty, PageHeader } from '../../components/ui';
import { fmtDateTime } from '../../utils/format';
import { errMsg } from '../../utils/helpers';

// Platform admin: create admins, choose what each may do, activate/deactivate, reset passwords.
export default function PlatformAdmins() {
  const toast = useToast();
  const admins = useFetch(() => get('/platform/admins'), []);
  const perms = useFetch(() => get('/platform/permissions'), []);
  const [form, setForm] = useState(null); // { mode: 'create' } | { mode: 'edit', admin }
  const [secret, setSecret] = useState(null);

  const areaFields = (perms.data || []).map((p) => ({
    name: `perm_${p.key}`, label: p.label, checkLabel: p.label, type: 'checkbox', half: true, show: (v) => !v.isPlatformAdmin,
  }));
  const platformField = { name: 'isPlatformAdmin', label: 'Platform admin', checkLabel: 'Platform admin (manages admins, may do everything)', type: 'checkbox' };
  const createFields = [
    { name: 'fullName', label: 'Full name', required: true },
    { name: 'email', label: 'Email', type: 'email', required: true },
    { name: 'phone', label: 'Phone', half: true },
    { name: 'designation', label: 'Designation', half: true, placeholder: 'e.g. Exam cell admin' },
    platformField, ...areaFields,
  ];
  const editFields = [platformField, ...areaFields];

  const toBody = (v) => ({
    isPlatformAdmin: !!v.isPlatformAdmin,
    permissions: (perms.data || []).filter((p) => v[`perm_${p.key}`]).map((p) => p.key),
  });
  const initial = form?.mode === 'edit'
    ? { isPlatformAdmin: form.admin.isPlatformAdmin, ...Object.fromEntries((form.admin.permissions || []).map((k) => [`perm_${k}`, true])) }
    : {};

  const save = async (v) => {
    if (form.mode === 'create') {
      const res = await post('/platform/admins', {
        fullName: v.fullName, email: v.email, ...(v.phone ? { phone: v.phone } : {}), ...(v.designation ? { designation: v.designation } : {}), ...toBody(v),
      });
      setSecret({ name: v.fullName, password: res.data.temporaryPassword });
      toast.success('Admin created');
    } else {
      await put(`/platform/admins/${form.admin.id}/permissions`, toBody(v));
      toast.success('Permissions saved');
    }
    setForm(null);
    admins.reload();
  };

  const setStatus = async (a, status) => {
    if (status !== 'active' && !window.confirm(`Deactivate ${a.fullName}? They will not be able to sign in.`)) return;
    try { await patch(`/platform/admins/${a.id}/status`, { status }); toast.success(status === 'active' ? 'Activated' : 'Deactivated'); admins.reload(); } catch (e) { toast.error(errMsg(e)); }
  };
  const resetPassword = async (a) => {
    if (!window.confirm(`Give ${a.fullName} a new temporary password?`)) return;
    try { const res = await post(`/platform/admins/${a.id}/reset-password`); setSecret({ name: a.fullName, password: res.data.temporaryPassword }); } catch (e) { toast.error(errMsg(e)); }
  };
  const label = (k) => (perms.data || []).find((p) => p.key === k)?.label || k;

  return (
    <>
      <PageHeader title="Platform Admins" subtitle="Who can administer the campus, and which parts each admin may use">
        <button className="btn btn-primary" onClick={() => setForm({ mode: 'create' })}>+ New admin</button>
      </PageHeader>

      <div className="card">
        <Async f={admins}>
          {!admins.data?.length && <Empty>No admins.</Empty>}
          {!!admins.data?.length && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Can use</th><th>Last sign-in</th><th /></tr></thead>
                <tbody>
                  {admins.data.map((a) => (
                    <tr key={a.id}>
                      <td><strong>{a.fullName}</strong>{a.isMe && <span className="muted"> (you)</span>}<div className="muted">{a.employeeCode}{a.designation ? ` · ${a.designation}` : ''}</div></td>
                      <td>{a.email}</td>
                      <td><Badge value={a.status} /></td>
                      <td>
                        {a.isPlatformAdmin
                          ? <Badge value="platform admin" tone="blue">Platform admin — everything</Badge>
                          : a.permissions.length
                            ? <div className="btn-group">{a.permissions.map((k) => <span key={k} className="chip">{label(k)}</span>)}</div>
                            : <span className="muted">Nothing yet</span>}
                      </td>
                      <td>{a.lastLoginAt ? fmtDateTime(a.lastLoginAt) : '-'}</td>
                      <td>
                        <div className="btn-group">
                          <button className="btn btn-sm" onClick={() => setForm({ mode: 'edit', admin: a })}>Permissions</button>
                          <button className="btn btn-sm" onClick={() => resetPassword(a)}>Reset password</button>
                          {!a.isMe && (a.status === 'active'
                            ? <button className="btn btn-sm btn-danger" onClick={() => setStatus(a, 'inactive')}>Deactivate</button>
                            : <button className="btn btn-sm" onClick={() => setStatus(a, 'active')}>Activate</button>)}
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

      <FormModal open={!!form} title={form?.mode === 'create' ? 'New admin' : `Permissions — ${form?.admin?.fullName}`}
        fields={form?.mode === 'create' ? createFields : editFields} initial={initial}
        submitLabel={form?.mode === 'create' ? 'Create admin' : 'Save'} onSubmit={save} onClose={() => setForm(null)} wide />

      <Modal open={!!secret} title="Temporary password" onClose={() => setSecret(null)}>
        <p>Give this password to <strong>{secret?.name}</strong>. It is shown only once, and they must change it at first login.</p>
        <div className="alert alert-info" style={{ fontSize: '1.3rem', textAlign: 'center', letterSpacing: 1 }}><code>{secret?.password}</code></div>
      </Modal>
    </>
  );
}
