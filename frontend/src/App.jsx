import { useEffect, useRef, useState } from 'react';
import { api, session } from './api.js';
import AuthPanel from './components/AuthPanel.jsx';
import Garage from './components/Garage.jsx';
import Result from './components/Result.jsx';
import VehicleForm from './components/VehicleForm.jsx';

export default function App() {
  const [view, setView] = useState('home');          // 'home' | 'garage' | 'auth'
  const [user, setUser] = useState(null);
  const [authReason, setAuthReason] = useState('');
  const [afterLogin, setAfterLogin] = useState('home');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const resultRef = useRef(null);

  const show = (data) => {
    setResult(data);
    setError('');
    requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  // On start: restore the login (if the token is still valid) and open a shared link (/?q=AB12CD).
  useEffect(() => {
    if (session.get()) api.me().then(setUser).catch(() => session.set(null));
    const code = new URLSearchParams(location.search).get('q');
    if (!code) return;
    setBusy(true);
    api.shared(code).then(show).catch((e) => setError(e.message)).finally(() => setBusy(false));
  }, []);

  const estimate = async (vehicleId, city) => {
    setView('home');
    setBusy(true);
    try {
      const data = await api.estimate(vehicleId, city);
      show(data);
      if (data.share_code) history.replaceState(null, '', `?q=${data.share_code}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const askLogin = (reason, next) => { setAuthReason(reason); setAfterLogin(next); setView('auth'); window.scrollTo({ top: 0 }); };
  const logout = () => { session.set(null); setUser(null); setView('home'); };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 [background-image:radial-gradient(ellipse_at_top,rgba(251,191,36,0.08),transparent_60%)]">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pt-5 sm:px-6">
        <button type="button" onClick={() => setView('home')} className="text-sm font-bold tracking-wide text-zinc-100 hover:text-amber-300">
          🏁 Tuning Estimator
        </button>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => (user ? setView('garage') : askLogin('Log in to see the vehicles you saved.', 'garage'))}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${view === 'garage' ? 'bg-zinc-800 text-amber-300' : 'text-zinc-300 hover:text-amber-300'}`}>
            My Garage
          </button>
          {user ? (
            <button type="button" onClick={logout} title={user.email} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:border-zinc-500">
              Log out
            </button>
          ) : (
            <button type="button" onClick={() => askLogin('', 'home')} className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:border-amber-400">
              Log in
            </button>
          )}
        </div>
      </nav>

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
        {view === 'auth' && (
          <AuthPanel reason={authReason} onCancel={() => setView('home')}
            onDone={(u) => { setUser(u); setView(afterLogin); }} />
        )}

        {view === 'garage' && user && (
          <Garage user={user} onOpen={estimate} onLoggedOut={() => { logout(); askLogin('Your session expired. Please log in again.', 'garage'); }} />
        )}

        <div hidden={view !== 'home'}>
          <header className="mb-8 max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-amber-400">Tuning cost estimator</p>
            <h1 className="mt-2 text-3xl font-bold leading-tight text-zinc-50 sm:text-5xl">What will it cost to tune your ride?</h1>
            <p className="mt-3 text-zinc-400">
              Pick your car or bike and your city to see price ranges for Stage 1, 2 and 3: parts, labour, GST and expected power gains.
            </p>
          </header>

          <VehicleForm onSubmit={estimate} busy={busy} />

          {error && <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300" role="alert">{error}</p>}

          <div ref={resultRef} className="mt-10 scroll-mt-6">
            {result && (
              <Result key={result.share_code ?? result.vehicle.id + result.city} result={result} user={user}
                onNeedLogin={() => askLogin('Log in or create a free account to save vehicles to your garage.', 'home')}
                onGoGarage={() => setView('garage')} />
            )}
          </div>
        </div>

        <footer className="mt-16 border-t border-zinc-800 pt-6 text-xs text-zinc-500">
          Sample prices for demonstration, not workshop quotes. Tuning can affect warranty, insurance and emission compliance.
        </footer>
      </main>
    </div>
  );
}
