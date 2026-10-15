import { useState } from 'react';
import { Link } from 'react-router-dom';
import { post } from '../../api/client';
import { errMsg } from '../../utils/helpers';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try { setMessage((await post('/auth/forgot-password', { email })).message); } catch (err) { setError(errMsg(err)); }
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>Forgot password</h1>
        <p className="muted">We will send a reset link to your email.</p>
        <form onSubmit={submit}>
          {message && <div className="alert alert-info">{message}</div>}
          {error && <div className="alert alert-error">{error}</div>}
          <div className="field"><label>Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <button className="btn btn-primary">Send reset link</button>
          <Link to="/login">Back to login</Link>
        </form>
      </div>
    </div>
  );
}
