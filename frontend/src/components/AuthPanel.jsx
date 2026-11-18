import { useState } from 'react';
import { api, session } from '../api.js';

// Log in / create account. Shown in the page flow (not a popup) so it works everywhere.
export default function AuthPanel({ onDone, onCancel, reason }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return setError('Enter your email.');
    if (mode === 'signup' && password.length < 8) return setError('Password must be at least 8 characters.');
    if (!password) return setError('Enter your password.');
    setBusy(true); setError('');
    try {
      const res = mode === 'login' ? await api.login(email, password) : await api.signup(email, password);
      session.set(res.token);
      onDone(res.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const field = 'w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20';
  return (
    <section className="mx-auto max-w-md rounded-2xl border border-zinc-800 bg-zinc-900/80 p-6 shadow-xl shadow-black/40">
      <div className="flex rounded-xl border border-zinc-700 bg-zinc-950 p-1">
        {[['login', 'Log in'], ['signup', 'Create account']].map(([m, text]) => (
          <button key={m} type="button" onClick={() => { setMode(m); setError(''); }} aria-pressed={mode === m}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${mode === m ? 'bg-amber-400 text-zinc-950' : 'text-zinc-400 hover:text-zinc-100'}`}>
            {text}
          </button>
        ))}
      </div>
      {reason && <p className="mt-4 text-sm text-zinc-400">{reason}</p>}
      <form onSubmit={submit} className="mt-4 space-y-3" noValidate>
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">Email</span>
          <input type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(''); }} className={`mt-1.5 ${field}`} />
        </label>
        <label className="block">
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">Password</span>
          <input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password}
            onChange={(e) => { setPassword(e.target.value); setError(''); }} className={`mt-1.5 ${field}`} />
          {mode === 'signup' && <span className="mt-1 block text-xs text-zinc-500">At least 8 characters.</span>}
        </label>
        {error && <p className="text-sm text-red-400" role="alert">{error}</p>}
        <div className="flex gap-3 pt-1">
          <button type="submit" disabled={busy}
            className="flex-1 rounded-xl bg-amber-400 py-3 font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:opacity-50">
            {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel} className="rounded-xl border border-zinc-700 px-4 text-sm text-zinc-300 hover:border-zinc-500">
              Cancel
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
