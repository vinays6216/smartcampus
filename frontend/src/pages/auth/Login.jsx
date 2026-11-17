import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { errMsg } from '../../utils/helpers';
import { AuthLayout, PasswordInput } from './AuthLayout';

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const u = await login(form.email.trim(), form.password);
      navigate(u.mustChangePassword ? '/change-password' : '/', { replace: true });
    } catch (err) {
      const msg = errMsg(err);
      setError(/network/i.test(msg) ? "Can't reach Smart Campus. Is the backend running?" : msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Welcome back"
      title="Sign in"
      description="Use the account your college gave you."
      footer={<>Students, lecturers and admins sign in here.</>}
    >
      <form className="au-form" onSubmit={submit}>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required autoComplete="email" placeholder="you@college.edu"
            value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <PasswordInput id="password" required autoComplete="current-password" placeholder="Your password"
            value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </div>
        <div className="au-row"><Link className="au-link" to="/forgot-password">Forgot password?</Link></div>
        <button className="btn btn-primary" disabled={busy}><LogIn size={16} />{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </AuthLayout>
  );
}
