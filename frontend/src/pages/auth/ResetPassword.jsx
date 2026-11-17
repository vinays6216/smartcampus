import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { post } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { errMsg } from '../../utils/helpers';
import { AuthLayout, PasswordInput } from './AuthLayout';

// Opened from the e-mailed link:  /reset-password?token=...
export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await post('/auth/reset-password', { token: params.get('token') || '', newPassword });
      toast.success('Password reset. Please log in.');
      navigate('/login');
    } catch (err) { setError(errMsg(err)); }
  };

  return (
    <AuthLayout eyebrow="Account help" title="Set a new password" description="Choose a password of at least 8 characters."
      footer={<Link className="au-link" to="/login">Back to sign in</Link>}>
      <form className="au-form" onSubmit={submit}>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="field">
          <label htmlFor="newPassword">New password</label>
          <PasswordInput id="newPassword" minLength={8} required autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </div>
        <button className="btn btn-primary">Reset password</button>
      </form>
    </AuthLayout>
  );
}
