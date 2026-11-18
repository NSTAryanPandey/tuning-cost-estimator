import { useState } from 'react';
import { years } from '../format.js';
import CarImage from './CarImage.jsx';
import Breakdown from './Breakdown.jsx';
import BudgetPlanner from './BudgetPlanner.jsx';
import CostChart from './CostChart.jsx';
import DynoChart from './DynoChart.jsx';
import SaveToGarage from './SaveToGarage.jsx';
import StageCard from './StageCard.jsx';

export default function Result({ result, user, onNeedLogin, onGoGarage }) {
  const [selected, setSelected] = useState(1);
  const [copied, setCopied] = useState(false);
  const v = result.vehicle;

  const shareUrl = result.share_code ? `${location.origin}${location.pathname}?q=${result.share_code}` : null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt('Copy this link:', shareUrl);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-4 sm:gap-6">
          <CarImage vehicle={v} className="h-20 w-40 shrink-0 sm:h-24 sm:w-48" />
          <div>
          <p className="text-sm text-zinc-400">Estimate for</p>
          <h2 className="text-2xl font-bold text-zinc-50 sm:text-3xl">{v.make} {v.model}</h2>
          <p className="text-zinc-400">
            {v.engine_name} · {years(v)}{v.stock_hp ? ` · stock ${v.stock_hp} hp / ${v.stock_torque_nm} Nm` : ''} · labour rates for {result.city}
          </p>
          </div>
        </div>
        {shareUrl && (
          <button type="button" onClick={copy}
            className="self-start rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-200 transition hover:border-amber-400 hover:text-amber-300 sm:self-auto">
            {copied ? 'Link copied ✓' : 'Copy share link'}
          </button>
        )}
      </div>

      {!result.tunable ? (
        <div className="rounded-2xl border border-sky-500/30 bg-sky-500/10 p-6 text-sky-100">
          <h3 className="font-semibold">This vehicle can't be tuned this way</h3>
          <p className="mt-1 text-sky-200/80">{result.reason}</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            {result.stages.map((s) => (
              <StageCard key={s.stage} stage={s} stockHp={v.stock_hp} selected={selected === s.stage} onSelect={() => setSelected(s.stage)} />
            ))}
          </div>
          <DynoChart vehicle={v} stages={result.stages} />
          <CostChart stages={result.stages} />
          <BudgetPlanner vehicle={v} city={result.city} />
          <Breakdown stage={result.stages.find((s) => s.stage === selected)} />
        </>
      )}

      <SaveToGarage vehicle={v} city={result.city} selectedStage={selected} tunable={result.tunable}
        user={user} onNeedLogin={onNeedLogin} onSaved={onGoGarage} />

      {result.notes?.length > 0 && (
        <ul className="space-y-1.5 text-sm text-zinc-400">
          {result.notes.map((n) => <li key={n}>• {n}</li>)}
        </ul>
      )}
    </div>
  );
}
