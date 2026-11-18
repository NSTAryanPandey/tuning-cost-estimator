import { num, range } from '../format.js';

const ACCENT = {
  1: 'from-emerald-400/20 border-emerald-400/40 text-emerald-300',
  2: 'from-amber-400/20 border-amber-400/40 text-amber-300',
  3: 'from-red-500/20 border-red-500/40 text-red-300',
};

// One clickable card per stage: total cost range + power after tuning.
export default function StageCard({ stage, stockHp, selected, onSelect }) {
  const [title, subtitle] = stage.name.split(' · ');
  const gain = stage.hp && stockHp ? Math.round(((stage.hp.min + stage.hp.max) / 2 / stockHp - 1) * 100) : null;
  return (
    <button type="button" onClick={onSelect} aria-pressed={selected}
      className={`rounded-2xl border bg-linear-to-b to-zinc-900/60 p-5 text-left transition hover:-translate-y-0.5 ${ACCENT[stage.stage]} ${selected ? 'ring-2 ring-current' : 'opacity-80 hover:opacity-100'}`}>
      <div className="text-sm font-semibold uppercase tracking-wider">{title}</div>
      <div className="text-sm text-zinc-400">{subtitle}</div>
      <div className="mt-4 font-mono text-xl font-semibold text-zinc-50 sm:text-2xl">{range(stage.total)}</div>
      {stage.hp && (
        <div className="mt-3 flex items-baseline gap-2 text-sm text-zinc-300">
          <span className="font-mono">{num(stage.hp)} hp</span>
          {gain !== null && <span className="text-zinc-500">(~+{gain}%)</span>}
          {stage.torque_nm && <span className="font-mono text-zinc-400">· {num(stage.torque_nm)} Nm</span>}
        </div>
      )}
      <div className="mt-1 text-xs text-zinc-500">{num(stage.labour_hours)} h total workshop time</div>
    </button>
  );
}
