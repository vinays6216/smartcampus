import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { post } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { PageHeader } from '../../components/ui';
import { errMsg } from '../../utils/helpers';

export default function ChangePassword() {
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.newPassword !== form.confirm) return setError('New password and confirmation do not match');
    try {
      await post('/auth/change-password', { currentPassword: form.currentPassword, newPassword: form.newPassword });
      updateUser({ mustChangePassword: false });
      toast.success('Password changed');
      navigate('/');
    } catch (err) { setError(errMsg(err)); }
    return undefined;
  };

  return (
    <>
      <PageHeader title="Change password" subtitle={user.mustChangePassword ? 'You must set a new password before continuing.' : undefined} />
      <div className="card" style={{ maxWidth: 440 }}>
        <form onSubmit={submit} className="form-grid">
          {error && <div className="alert alert-error full">{error}</div>}
          <div className="field"><label>Current password</label>
            <input type="password" required value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} /></div>
          <div className="field"><label>New password (min 8 characters)</label>
            <input type="password" minLength={8} required value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} /></div>
          <div className="field"><label>Confirm new password</label>
            <input type="password" minLength={8} required value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} /></div>
          <div className="form-actions full"><button className="btn btn-primary">Update password</button></div>
        </form>
      </div>
    </>
  );
}
