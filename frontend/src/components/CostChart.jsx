import { mid, rupees } from '../format.js';

// Stacked horizontal bars: what each stage's money goes on (midpoint of each range).
const GROUPS = [
  { key: 'software', label: 'Software / tuner', color: 'bg-violet-400' },
  { key: 'part', label: 'Parts', color: 'bg-amber-400' },
  { key: 'service', label: 'Dyno session', color: 'bg-sky-400' },
  { key: 'labour', label: 'Labour', color: 'bg-emerald-400' },
  { key: 'tax', label: 'GST + buffer', color: 'bg-zinc-500' },
];

function segments(stage) {
  const totals = Object.fromEntries(GROUPS.map((g) => [g.key, 0]));
  for (const item of stage.items) totals[item.kind] = (totals[item.kind] || 0) + mid(item.cost);
  totals.tax = mid(stage.gst) + mid(stage.contingency);
  return totals;
}

export default function CostChart({ stages }) {
  const rows = stages.map((s) => ({ stage: s, seg: segments(s) }));
  const sum = (seg) => Object.values(seg).reduce((a, b) => a + b, 0);
  const biggest = Math.max(...rows.map((r) => sum(r.seg)));
  const used = GROUPS.filter((g) => rows.some((r) => r.seg[g.key] > 0));

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-zinc-100">Where the money goes</h3>
        <span className="text-xs text-zinc-500">Bar = middle of each price range</span>
      </div>
      <div className="mt-5 space-y-4">
        {rows.map(({ stage, seg }) => (
          <div key={stage.stage} className="grid grid-cols-[4.5rem_1fr] items-center gap-3 sm:grid-cols-[5rem_1fr_7rem]">
            <span className="text-sm text-zinc-400">Stage {stage.stage}</span>
            <div className="flex h-7 overflow-hidden rounded-lg bg-zinc-800" style={{ width: `${Math.max(4, (sum(seg) / biggest) * 100)}%` }}
              role="img" aria-label={`Stage ${stage.stage}: about ${rupees(sum(seg))}`}>
              {GROUPS.map((g) => seg[g.key] > 0 && (
                <div key={g.key} className={`${g.color} h-full`} style={{ width: `${(seg[g.key] / sum(seg)) * 100}%` }}
                  title={`${g.label}: ~${rupees(seg[g.key])}`} />
              ))}
            </div>
            <span className="col-start-2 font-mono text-sm text-zinc-300 sm:col-start-3 sm:text-right">~{rupees(sum(seg))}</span>
          </div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2">
        {used.map((g) => (
          <span key={g.key} className="flex items-center gap-2 text-xs text-zinc-400">
            <span className={`h-2.5 w-2.5 rounded-sm ${g.color}`} />{g.label}
          </span>
        ))}
      </div>
    </section>
  );
}
