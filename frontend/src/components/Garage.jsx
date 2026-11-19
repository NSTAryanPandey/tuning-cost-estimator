import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { num, range, years } from '../format.js';
import CarImage from './CarImage.jsx';
import VehiclePhoto from './VehiclePhoto.jsx';

// "My Garage": the vehicles a logged-in user saved, with today's estimate for their target stage.
export default function Garage({ user, onOpen, onLoggedOut }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(null);

  useEffect(() => {
    api.garage().then(setItems).catch((e) => {
      if (e.status === 401) onLoggedOut();
      else setError(e.message);
    });
  }, []);

  const remove = async (id) => {
    try {
      await api.removeFromGarage(id);
      setItems((list) => list.filter((i) => i.id !== id));
    } catch (e) {
      setError(e.message);
    } finally {
      setConfirming(null);
    }
  };

  return (
    <section>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-zinc-50 sm:text-3xl">My Garage</h2>
          <p className="text-sm text-zinc-400">{user.email}</p>
        </div>
        {items && <span className="text-sm text-zinc-500">{items.length} saved</span>}
      </div>
      {error && <p className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300" role="alert">{error}</p>}
      {!items && !error && <p className="text-zinc-400">Loading your garage…</p>}
      {items?.length === 0 && (
        <div className="rounded-2xl border border-dashed border-zinc-700 p-10 text-center">
          <p className="text-zinc-300">Your garage is empty.</p>
          <p className="mt-1 text-sm text-zinc-500">Get an estimate for your car or bike, then press "Save to My Garage".</p>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {items?.map((i) => (
          <article key={i.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
            <div className="flex items-center gap-4">
              {i.vehicle ? <VehiclePhoto vehicle={i.vehicle} className="h-20 w-32 shrink-0" /> : <CarImage vehicle={{}} className="h-16 w-32 shrink-0" />}
              <div className="min-w-0">
                <h3 className="truncate font-semibold text-zinc-100">{i.nickname || (i.vehicle ? `${i.vehicle.make} ${i.vehicle.model}` : 'Vehicle removed')}</h3>
                {i.vehicle && (
                  <p className="truncate text-sm text-zinc-400">
                    {i.nickname ? `${i.vehicle.make} ${i.vehicle.model} · ` : ''}{i.vehicle.engine_name} · {years(i.vehicle)}
                  </p>
                )}
                <p className="text-xs text-zinc-500">{i.city} · saved {new Date(i.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              </div>
            </div>
            {i.target ? (
              <div className="mt-4 rounded-xl bg-zinc-950/60 p-3">
                <div className="text-xs uppercase tracking-wider text-zinc-500">Goal: {i.target.name}</div>
                <div className="mt-1 font-mono text-lg font-semibold text-amber-300">{range(i.target.total)}</div>
                {i.target.hp && <div className="text-sm text-zinc-400">{i.vehicle?.stock_hp} → {num(i.target.hp)} hp</div>}
              </div>
            ) : (
              <p className="mt-4 text-sm text-zinc-500">No target stage set.</p>
            )}
            {i.notes && <p className="mt-3 whitespace-pre-line text-sm text-zinc-300">{i.notes}</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              {i.vehicle && (
                <button type="button" onClick={() => onOpen(i.vehicle_id, i.city)}
                  className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-300">
                  Open estimate
                </button>
              )}
              {confirming === i.id ? (
                <>
                  <button type="button" onClick={() => remove(i.id)} className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-400">
                    Yes, remove
                  </button>
                  <button type="button" onClick={() => setConfirming(null)} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300">
                    Keep
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setConfirming(i.id)} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-red-400 hover:text-red-300">
                  Remove
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
