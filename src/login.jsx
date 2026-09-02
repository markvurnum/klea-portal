import React, { useState } from 'react';
import { api, auth } from './api.js';
import { Logo, ThemeToggle } from './ui.jsx';

export default function Login({ onSignedIn, intent }) {
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async e => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await api.post('/api/auth/login', form);
      auth.set(res.token);
      onSignedIn(res.user);
    } catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <div>
      <header className="site-head">
        <div className="container" style={{ height: 64 }}>
          <a href="#/" style={{ textDecoration: 'none' }}><Logo /></a>
          <ThemeToggle />
        </div>
      </header>
      <div className="container" style={{ maxWidth: 420, padding: '60px 20px' }}>
        <form className="card" onSubmit={submit}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 34, color: 'var(--ochre)' }}>✦</div>
            <h1 style={{ fontSize: 24, margin: '6px 0 4px' }}>{intent === 'cleaner' ? 'Kleaner sign in' : 'Team sign in'}</h1>
            <p className="muted small">Use the email and password the office gave you.</p>
          </div>
          <div className="field"><label>Email</label>
            <input type="email" autoComplete="username" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="field"><label>Password</label>
            <input type="password" autoComplete="current-password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
          </div>
          {error && <p className="small" style={{ color: 'var(--bad)', marginBottom: 10 }}>{error}</p>}
          <button className="btn gold" type="submit" disabled={busy} style={{ width: '100%' }}>{busy ? 'Signing in…' : 'Sign in'}</button>
          <p className="small muted" style={{ textAlign: 'center', marginTop: 14 }}>
            Trouble signing in? Ask the office to reset your password.
          </p>
        </form>
      </div>
    </div>
  );
}
