import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { post } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { errMsg } from '../../utils/helpers';

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
    <div className="login-wrap">
      <div className="login-card">
        <h1>Set new password</h1>
        <form onSubmit={submit}>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="field"><label>New password (min 8 characters)</label>
            <input type="password" minLength={8} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></div>
          <button className="btn btn-primary">Reset password</button>
          <Link to="/login">Back to login</Link>
        </form>
      </div>
    </div>
  );
}
