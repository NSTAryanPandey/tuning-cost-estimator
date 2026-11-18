import { useMemo, useState } from 'react';

// Illustrative dyno chart: power (solid) and torque (dashed) against engine speed, stock vs each stage.
// We only know peak figures, so the curve SHAPE comes from the engine type (turbo petrol has a flat
// torque plateau, diesels peak early, non-turbo engines peak high, bikes rev far higher) and is
// scaled so the peaks match the stock and tuned numbers.

const SHAPES = {
  petrol_turbo: { redline: 6500, pts: [[0.15, 0.55], [0.23, 0.8], [0.27, 1], [0.69, 1], [0.85, 0.86], [1, 0.7]] },
  diesel_turbo: { redline: 4500, pts: [[0.22, 0.5], [0.31, 0.8], [0.36, 1], [0.62, 1], [0.8, 0.82], [1, 0.6]] },
  petrol_na: { redline: 6800, pts: [[0.15, 0.7], [0.29, 0.8], [0.44, 0.88], [0.65, 1], [0.81, 0.95], [1, 0.82]] },
  bike_petrol: { redline: 10000, pts: [[0.15, 0.6], [0.35, 0.8], [0.6, 1], [0.8, 0.94], [1, 0.8]] },
};
const COLORS = { 0: '#a1a1aa', 1: '#34d399', 2: '#fbbf24', 3: '#f87171' };
const N = 48;
const mid = (r) => (r.min + r.max) / 2;

function torqueShape(shape, x) {   // x = rpm / redline, 0..1; linear interpolation between points
  const p = shape.pts;
  if (x <= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i++) {
    if (x <= p[i][0]) {
      const [x0, y0] = p[i - 1], [x1, y1] = p[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return p[p.length - 1][1];
}

function curves(engineType, stockHp, stockTq, targetHp, targetTq) {
  const base = SHAPES[engineType] ?? SHAPES.petrol_turbo;
  const redline = engineType === 'bike_petrol' ? (stockHp < 15 ? 8500 : stockHp < 60 ? 10000 : 12500) : base.redline;
  const start = base.pts[0][0];
  const xs = Array.from({ length: N }, (_, i) => start + ((1 - start) * i) / (N - 1));
  const tq = xs.map((x) => torqueShape(base, x));
  const pw = xs.map((x, i) => tq[i] * x);
  const maxT = Math.max(...tq), maxP = Math.max(...pw);
  return xs.map((x, i) => ({ rpm: x * redline, hp: (pw[i] / maxP) * targetHp, nm: (tq[i] / maxT) * (targetTq || stockTq || 0) }));
}

export default function DynoChart({ vehicle, stages }) {
  const [showTorque, setShowTorque] = useState(true);
  const series = useMemo(() => {
    const { engine_type: et, stock_hp: hp, stock_torque_nm: tq } = vehicle;
    const rows = [{ stage: 0, name: 'Stock', pts: curves(et, hp, tq, hp, tq) }];
    for (const s of stages) {
      if (s.hp) rows.push({ stage: s.stage, name: `Stage ${s.stage}`, pts: curves(et, hp, tq, mid(s.hp), s.torque_nm ? mid(s.torque_nm) : tq) });
    }
    return rows;
  }, [vehicle, stages]);

  if (!vehicle.stock_hp || series.length < 2) return null;

  const W = 640, H = 300, L = 52, R = showTorque ? 52 : 16, T = 16, B = 40;
  const maxRpm = Math.max(...series[0].pts.map((p) => p.rpm));
  const minRpm = series[0].pts[0].rpm;
  const maxHp = Math.max(...series.flatMap((s) => s.pts.map((p) => p.hp))) * 1.1;
  const maxNm = Math.max(...series.flatMap((s) => s.pts.map((p) => p.nm))) * 1.1;
  const x = (rpm) => L + ((rpm - minRpm) / (maxRpm - minRpm)) * (W - L - R);
  const yHp = (v) => H - B - (v / maxHp) * (H - T - B);
  const yNm = (v) => H - B - (v / maxNm) * (H - T - B);
  const path = (pts, key, y) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.rpm).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(' ');
  const step = maxRpm > 9000 ? 2000 : 1000;
  const rpmTicks = [];
  for (let r = Math.ceil(minRpm / step) * step; r <= maxRpm; r += step) rpmTicks.push(r);
  const hpTicks = [0.25, 0.5, 0.75, 1].map((f) => (maxHp / 1.1) * f);
  const fmt = (v) => (v < 50 ? v.toFixed(1) : Math.round(v));

  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-zinc-100">Dyno graph</h3>
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          <input type="checkbox" checked={showTorque} onChange={(e) => setShowTorque(e.target.checked)} className="accent-amber-400" />
          Show torque (dashed)
        </label>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 w-full" role="img"
        aria-label={`Power curves: ${series.map((s) => `${s.name} ${fmt(Math.max(...s.pts.map((p) => p.hp)))} hp`).join(', ')}`}>
        {hpTicks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={yHp(v)} y2={yHp(v)} stroke="#27272a" />
            <text x={L - 8} y={yHp(v) + 4} textAnchor="end" fontSize="11" fill="#71717a">{fmt(v)}</text>
          </g>
        ))}
        {showTorque && [0.25, 0.5, 0.75, 1].map((f) => (
          <text key={f} x={W - R + 8} y={yNm((maxNm / 1.1) * f) + 4} fontSize="11" fill="#52525b">{fmt((maxNm / 1.1) * f)}</text>
        ))}
        {rpmTicks.map((r) => (
          <text key={r} x={x(r)} y={H - B + 18} textAnchor="middle" fontSize="11" fill="#71717a">{(r / 1000).toFixed(0)}k</text>
        ))}
        <text x={L - 8} y={T - 4} textAnchor="end" fontSize="11" fill="#a1a1aa">hp</text>
        {showTorque && <text x={W - R + 8} y={T - 4} fontSize="11" fill="#71717a">Nm</text>}
        <text x={(L + W - R) / 2} y={H - 6} textAnchor="middle" fontSize="11" fill="#71717a">engine speed (rpm)</text>
        {series.map((s) => (
          <g key={s.stage}>
            {showTorque && <path d={path(s.pts, 'nm', yNm)} fill="none" stroke={COLORS[s.stage]} strokeWidth="1.5" strokeDasharray="5 4" opacity="0.7" />}
            <path d={path(s.pts, 'hp', yHp)} fill="none" stroke={COLORS[s.stage]} strokeWidth={s.stage === 0 ? 2 : 2.5} strokeLinejoin="round" />
          </g>
        ))}
      </svg>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {series.map((s) => {
          const peak = s.pts.reduce((a, b) => (b.hp > a.hp ? b : a));
          return (
            <span key={s.stage} className="flex items-center gap-2 text-xs text-zinc-400">
              <span className="h-0.5 w-5 rounded" style={{ background: COLORS[s.stage] }} />
              {s.name}: <span className="font-mono text-zinc-200">{fmt(peak.hp)} hp</span> @ {Math.round(peak.rpm / 100) * 100} rpm
            </span>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-zinc-500">Illustrative curves shaped by engine type and scaled to the peak figures. Real dyno results vary.</p>
    </section>
  );
}
