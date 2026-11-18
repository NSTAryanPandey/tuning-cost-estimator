import { useState } from 'react';
import { api } from '../api.js';

// "Save to My Garage" on the results page: nickname, goal stage and notes.
export default function SaveToGarage({ vehicle, city, selectedStage, tunable, user, onNeedLogin, onSaved }) {
  const [open, setOpen] = useState(false);
  const [nickname, setNickname] = useState('');
  const [stage, setStage] = useState(tunable ? String(selectedStage) : '');
  const [notes, setNotes] = useState('');
  const [state, setState] = useState({ busy: false, error: '', saved: false });

  if (state.saved) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
        Saved to your garage ✓
        <button type="button" onClick={onSaved} className="font-semibold underline underline-offset-4 hover:text-emerald-100">Go to My Garage</button>
      </div>
    );
  }
  if (!open) {
    return (
      <button type="button" onClick={() => (user ? setOpen(true) : onNeedLogin())}
        className="w-full rounded-2xl border border-dashed border-zinc-700 p-4 text-sm font-semibold text-zinc-300 transition hover:border-amber-400 hover:text-amber-300">
        ＋ Save to My Garage{!user && ' (log in)'}
      </button>
    );
  }

  const save = async (e) => {
    e.preventDefault();
    setState({ busy: true, error: '', saved: false });
    try {
      await api.saveToGarage({ vehicle_id: vehicle.id, city, nickname: nickname || null, target_stage: stage ? Number(stage) : null, notes: notes || null });
      setState({ busy: false, error: '', saved: true });
    } catch (err) {
      if (err.status === 401) onNeedLogin();
      setState({ busy: false, error: err.message, saved: false });
    }
  };

  const field = 'w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 text-zinc-100 outline-none focus:border-amber-400';
  return (
    <form onSubmit={save} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
      <h3 className="font-semibold text-zinc-100">Save to My Garage</h3>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-zinc-400">Nickname (optional)</span>
          <input value={nickname} maxLength={60} onChange={(e) => setNickname(e.target.value)} placeholder={`My ${vehicle.model}`} className={`mt-1.5 ${field}`} />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-zinc-400">Goal</span>
          <select value={stage} onChange={(e) => setStage(e.target.value)} className={`field mt-1.5 pr-9 ${field}`}>
            <option value="">No goal yet</option>
            {tunable && [1, 2, 3].map((s) => <option key={s} value={s}>Stage {s}</option>)}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs uppercase tracking-wider text-zinc-400">Notes (optional)</span>
          <textarea value={notes} maxLength={500} rows={2} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Stage 1 done in March at XYZ Motors" className={`mt-1.5 ${field}`} />
        </label>
      </div>
      {state.error && <p className="mt-3 text-sm text-red-400" role="alert">{state.error}</p>}
      <div className="mt-4 flex gap-3">
        <button type="submit" disabled={state.busy} className="rounded-xl bg-amber-400 px-5 py-2.5 font-semibold text-zinc-950 hover:bg-amber-300 disabled:opacity-50">
          {state.busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-zinc-700 px-4 text-sm text-zinc-300">Cancel</button>
      </div>
    </form>
  );
}
