import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { post } from '../../api/client';
import { errMsg } from '../../utils/helpers';
import { AuthLayout } from './AuthLayout';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try { setMessage((await post('/auth/forgot-password', { email })).message); } catch (err) { setError(errMsg(err)); } finally { setBusy(false); }
  };

  return (
    <AuthLayout title="Forgot password" description="We will send a reset link to your email."
      footer={<Link className="au-link" to="/login">Back to sign in</Link>}>
      <form className="au-form" onSubmit={submit}>
        {message && <div className="alert alert-info">{message}</div>}
        {error && <div className="alert alert-error">{error}</div>}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required autoComplete="email" placeholder="you@college.edu" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <button className="btn btn-primary" disabled={busy}><Mail size={16} />{busy ? 'Sending…' : 'Send reset link'}</button>
      </form>
    </AuthLayout>
  );
}
