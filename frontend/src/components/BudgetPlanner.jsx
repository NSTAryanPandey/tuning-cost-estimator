import { useState } from 'react';
import { api } from '../api.js';
import { num, range, rupees } from '../format.js';

const PRESETS = { car: [50000, 100000, 250000, 500000], bike: [15000, 30000, 60000, 150000] };

// "I have ₹X: what should I do?" Asks the backend for the best set of upgrades within the budget.
export default function BudgetPlanner({ vehicle, city }) {
  const cls = vehicle.vehicle_class === 'bike' ? 'bike' : 'car';
  const [budget, setBudget] = useState(String(PRESETS[cls][1]));
  const [basis, setBasis] = useState('typical');
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (amount = budget, b = basis) => {
    const value = Number(String(amount).replace(/[^\d]/g, ''));
    if (!value) { setError('Enter a budget in rupees.'); return; }
    setBusy(true); setError('');
    try {
      setPlan(await api.budget(vehicle.id, city, value, b));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-amber-400/30 bg-amber-400/5 p-5 sm:p-6">
      <h3 className="font-semibold text-zinc-100">Budget planner</h3>
      <p className="mt-1 text-sm text-zinc-400">Enter what you want to spend. We pick the upgrades that give the most power for that money.</p>

      <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={(e) => { e.preventDefault(); run(); }}>
        <label className="flex flex-1 flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">Your budget (₹)</span>
          <input inputMode="numeric" value={budget} onChange={(e) => { setBudget(e.target.value); setError(''); }}
            className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 font-mono text-zinc-100 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">Plan for</span>
          <select value={basis} onChange={(e) => { setBasis(e.target.value); if (plan) run(budget, e.target.value); }}
            className="field rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-3 pr-9 text-zinc-100 outline-none focus:border-amber-400">
            <option value="typical">Typical prices</option>
            <option value="worst">Worst case (top of range)</option>
          </select>
        </label>
        <button type="submit" disabled={busy}
          className="rounded-xl bg-amber-400 px-6 py-3 font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:opacity-50">
          {busy ? 'Planning…' : 'Plan my build'}
        </button>
      </form>
      <div className="mt-3 flex flex-wrap gap-2">
        {PRESETS[cls].map((p) => (
          <button key={p} type="button" onClick={() => { setBudget(String(p)); run(p); }}
            className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:border-amber-400 hover:text-amber-300">
            {rupees(p)}
          </button>
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-red-400" role="alert">{error}</p>}

      {plan && plan.tunable === false && <p className="mt-5 text-sm text-sky-200">This vehicle can't be tuned this way, so there's nothing to plan.</p>}
      {plan && plan.tunable && (
        <div className="mt-5 space-y-4" aria-live="polite">
          {plan.affordable ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm text-zinc-400">Best build for {rupees(plan.budget)}</span>
                <span className="font-mono text-lg font-semibold text-amber-300">{range(plan.total)}</span>
              </div>
              <ul className="mt-3 space-y-1.5 text-sm">
                {plan.items.map((i) => (
                  <li key={i.label} className="flex justify-between gap-3">
                    <span className="text-zinc-200">✓ {i.label} <span className="text-zinc-500">(Stage {i.stage})</span></span>
                    <span className="font-mono text-zinc-400">{range(i.cost)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-zinc-500">Item prices include their share of labour. Total includes 18% GST{plan.contingency.max > 0 ? ' and a 10% buffer' : ''}.</p>
              {plan.hp && (
                <p className="mt-3 text-sm text-zinc-200">
                  Power: <span className="font-mono">{vehicle.stock_hp} → {num(plan.hp)} hp</span>
                  <span className="text-zinc-500"> (+{num(plan.gain_pct)}%)</span>
                </p>
              )}
            </div>
          ) : (
            <p className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4 text-sm text-zinc-300">
              {rupees(plan.budget)} isn't enough for any upgrade on this vehicle yet.
            </p>
          )}
          {plan.next_step && (
            <p className="text-sm text-zinc-300">
              <span className="font-semibold text-zinc-100">Next step:</span> add about <span className="font-mono text-amber-300">{rupees(plan.next_step.extra_cost)}</span> more
              to get {plan.next_step.adds.join(' + ')}{plan.next_step.hp ? <> (→ <span className="font-mono">{num(plan.next_step.hp)} hp</span>)</> : ''}.
            </p>
          )}
          {!plan.next_step && plan.affordable && <p className="text-sm text-emerald-300">That's the full Stage 3 build: nothing more to add.</p>}
          <p className="text-xs text-zinc-500">Checked {plan.options_checked} valid combinations (software first; Stage 3 parts need Stage 2 parts and a dyno session).</p>
        </div>
      )}
    </section>
  );
}
