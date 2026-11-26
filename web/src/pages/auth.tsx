// Sign-in and first-run setup.

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError, setCsrf } from '../api';
import { useSession } from '../session';
import { Icon } from '../ui';

function AuthSide() {
  return (
    <div className="auth-side">
      <div>
        <div className="auth-brand">
          <span className="brand-mark" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
              <path d="M5 19 12 4l7 15M8.6 13.5h6.8" />
            </svg>
          </span>
          <span className="brand-name">Anvil Ops</span>
        </div>
        <h2>Every client, site and invoice in one operating record.</h2>
        <p>
          Built for studios that run websites after launch: pipeline, delivery, monitoring, maintenance,
          agreements and money — with a distinction between what was measured and what was reported.
        </p>
        <ul>
          <li><Icon name="check" size={14} /> Client isolation enforced server-side</li>
          <li><Icon name="check" size={14} /> Confirmed payments only count as revenue</li>
          <li><Icon name="check" size={14} /> Versioned API with scoped, per-site keys</li>
        </ul>
      </div>
      <div style={{ fontSize: 11.5, color: '#7f868d' }}>Anvil Ops · studio operations platform</div>
    </div>
  );
}

export function Login() {
  const { refresh, session } = useSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ csrf: string; user: { role: string } }>('/app/api/session', {
        body: { email, password },
      });
      if (data.csrf) setCsrf(data.csrf);
      await refresh();
      navigate(data.user.role === 'client' ? '/portal' : '/admin', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <AuthSide />
      <div className="auth-form-wrap">
        <form className="auth-form" onSubmit={submit}>
          <h1>Sign in</h1>
          <div className="auth-sub">Use the account issued for your studio or client portal.</div>
          {error ? <div className="flash err">{error}</div> : null}
          <div className="field">
            <label className="lbl" htmlFor="email">Email</label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="password">Password</label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button className="btn accent" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
          <div className="auth-foot">
            {session?.setup_needed ? <>First run? <Link to="/setup">Create the administrator account</Link>.</> : 'Sessions expire after 12 hours.'}
          </div>
        </form>
      </div>
    </div>
  );
}

export function Setup() {
  const { refresh, session } = useSession();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', business: '', password: '', password2: '' });
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFields({});
    try {
      const data = await api<{ csrf: string }>('/app/api/setup', { body: form });
      if (data.csrf) setCsrf(data.csrf);
      await refresh();
      navigate('/admin', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFields(err.fields ?? {});
      } else {
        setError('Could not create the workspace.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <AuthSide />
      <div className="auth-form-wrap">
        <form className="auth-form" onSubmit={submit}>
          <h1>Create your workspace</h1>
          <div className="auth-sub">
            {session?.setup_needed === false
              ? 'This workspace already has an account. You can still sign in.'
              : 'This is the only account that can be created without an invitation. It becomes the administrator.'}
          </div>
          {error ? <div className="flash err">{error}</div> : null}
          <div className="field">
            <label className="lbl" htmlFor="name">Your name</label>
            <input id="name" className="input" required value={form.name} onChange={set('name')} />
            {fields.name ? <div className="hint" style={{ color: 'var(--danger)' }}>{fields.name}</div> : null}
          </div>
          <div className="field">
            <label className="lbl" htmlFor="email">Email</label>
            <input id="email" className="input" type="email" required value={form.email} onChange={set('email')} />
            {fields.email ? <div className="hint" style={{ color: 'var(--danger)' }}>{fields.email}</div> : null}
          </div>
          <div className="field">
            <label className="lbl" htmlFor="business">Studio or business name</label>
            <input id="business" className="input" value={form.business} onChange={set('business')} placeholder="Anvil Web Studio" />
          </div>
          <div className="field">
            <label className="lbl" htmlFor="password">Password</label>
            <input id="password" className="input" type="password" required minLength={10} value={form.password} onChange={set('password')} />
            <div className="hint">At least 10 characters. Stored as PBKDF2-SHA256.</div>
            {fields.password ? <div className="hint" style={{ color: 'var(--danger)' }}>{fields.password}</div> : null}
          </div>
          <div className="field">
            <label className="lbl" htmlFor="password2">Confirm password</label>
            <input id="password2" className="input" type="password" required value={form.password2} onChange={set('password2')} />
            {fields.password2 ? <div className="hint" style={{ color: 'var(--danger)' }}>{fields.password2}</div> : null}
          </div>
          <button className="btn accent" type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create workspace'}
          </button>
          <div className="auth-foot">
            Already set up? <Link to="/login">Sign in</Link>.
          </div>
        </form>
      </div>
    </div>
  );
}
