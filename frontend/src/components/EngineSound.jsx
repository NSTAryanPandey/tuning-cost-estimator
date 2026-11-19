import { useEffect, useMemo, useRef, useState } from 'react';

// "Hear the difference": a synthesized engine rev for stock and each tuning stage, made live with the
// Web Audio API (no recordings). Every vehicle gets its own sound, built from its specs (profileFor):
//   * firing frequency = rpm / 60 × cylinders / 2 (four-stroke), so a single thumps and a V8 burbles;
//   * layout: singles, V-twins and V8s fire unevenly (a pulsing "lump"); inline-4s scream smoothly;
//   * displacement sets the sub-bass and how deep the exhaust booms; redline comes from the engine type;
//   * a per-model "voice" (small pitch and resonance shifts) so no two models sound exactly alike;
//   * each stage opens the exhaust: louder, more distortion (rasp), a brighter filter;
//   * turbo engines get a whistle that rises with boost, and from Stage 2 a blow-off when you lift;
//   * petrol engines from Stage 2 crackle and pop on the overrun; diesels clatter.
// It is illustrative, not a recording of the real vehicle.

// ---- each vehicle's sound profile, worked out from its own specs ----
const TWINS = /Interceptor|Continental|Super Meteor|Shotgun|Bear 650|Classic 650|Ninja 300|Ninja 500|Ninja 650|Z650|Versys|\bR3\b|MT-03|Eliminator|NX500|Speed Twin/i;
const VTWINS = /Nightster|Fat Boy|Scrambler Icon|Monster|Panigale V2/i;
const TRIPLES_BIKE = /Trident|Street Triple/i;
const FOURS_BIKE = /CBR650R|Z900|ZX-10R|Hayabusa|S 1000 RR/i;
const THREE_CYL_CAR = /Z-Series|Revotron|Hyperion|Puretech|MPFi|TGDi|mHawk75|mHawk100|K10C|1\.0|B4D|SCe|Energy/i;

function hash(text) { let h = 2166136261; for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967295; }

function displacementLitres(v) {
  const name = v.engine_name || '';
  const cc = name.match(/(\d{2,4})\s*cc/i);
  if (cc) return Number(cc[1]) / 1000;
  const l = name.match(/(\d\.\d)/);
  return l ? Number(l[1]) : null;
}

export function profileFor(v) {
  const et = v.engine_type, hp = v.stock_hp || 100, model = `${v.make || ''} ${v.model || ''}`, name = `${v.engine_name || ''} ${model}`;
  const bike = et === 'bike_petrol' || v.vehicle_class === 'bike';
  const litres = displacementLitres(v) ?? (bike ? 0.15 : 1.5);
  let cyl = 4, layout = 'inline';
  if (bike) {
    if (FOURS_BIKE.test(name)) cyl = 4;
    else if (TRIPLES_BIKE.test(name)) cyl = 3;
    else if (VTWINS.test(name)) { cyl = 2; layout = 'vtwin'; }
    else if (/R 1250 GS/i.test(name)) { cyl = 2; layout = 'boxer'; }
    else if (TWINS.test(name)) cyl = 2;
    else { cyl = 1; layout = 'single'; }
  } else if (/V8|5\.0/i.test(name)) { cyl = 8; layout = 'v8'; }
  else if (/911/i.test(name)) { cyl = 6; layout = 'flat6'; }
  else if (litres >= 2.9) cyl = 6;
  else if (litres <= 1.05 || THREE_CYL_CAR.test(name)) cyl = 3;

  let redline;
  if (bike) {
    if (cyl === 4) redline = hp > 150 ? 13500 : 12000;
    else if (cyl === 3) redline = 11000;
    else if (layout === 'vtwin') redline = /Panigale|Monster/i.test(name) ? 10500 : 5800;
    else if (layout === 'boxer') redline = 9000;
    else if (cyl === 2) redline = /Royal Enfield/i.test(model) ? 7500 : hp > 40 ? 9500 : 7500;
    else redline = /KTM|Husqvarna|Duke|RC |Apache RR|R15|MT-15/i.test(name) ? 10500 : hp < 12 ? 8500 : v.body_type === 'cruiser' ? 6200 : 9000;
  } else if (et === 'diesel_turbo') redline = litres >= 2.5 ? 4200 : 4800;
  else if (layout === 'v8') redline = 7000;
  else if (layout === 'flat6') redline = 7500;
  else redline = et === 'petrol_na' ? 6800 : 6500;

  const voice = hash(model);                      // a stable "exhaust voice" per model
  return {
    cyl, layout, redline, bike, litres, hp,
    idle: bike ? (layout === 'vtwin' && redline < 7000 ? 900 : cyl >= 4 ? 1300 : 1200) : et === 'diesel_turbo' ? 750 : cyl >= 6 ? 700 : 850,
    turbo: et === 'petrol_turbo' || et === 'diesel_turbo',
    diesel: et === 'diesel_turbo',
    petrol: et === 'petrol_turbo' || et === 'petrol_na' || et === 'bike_petrol',
    pitch: 0.94 + voice * 0.12,                   // ±6% pitch character
    resonance: Math.max(160, 520 - litres * 70 - (layout === 'v8' ? 120 : 0)) * (0.85 + hash(model + 'r') * 0.3),   // exhaust boom: bigger engine = deeper
    pulse: layout === 'single' ? 0.55 : layout === 'vtwin' ? 0.7 : layout === 'v8' ? 0.35 : layout === 'boxer' ? 0.3 : cyl === 3 ? 0.2 : 0.08,   // uneven, lumpy firing
    rumble: Math.min(1, 0.25 + litres * 0.18),    // sub-bass grows with displacement
  };
}

function describe(p) {
  const layoutName = { single: 'single-cylinder', vtwin: 'V-twin', boxer: 'boxer twin', v8: 'V8', flat6: 'flat-six' }[p.layout]
    || (p.cyl === 2 ? 'parallel twin' : `${p.cyl}-cylinder`);
  const size = p.litres < 1 ? `${Math.round(p.litres * 1000)} cc` : `${p.litres.toFixed(1)} L`;
  return `${layoutName} · ${size} · ${p.diesel ? 'diesel' : 'petrol'}${p.turbo ? ' turbo' : ''} · redline ${p.redline.toLocaleString('en-IN')} rpm`;
}

const T = 4.8;                 // length of one rev, seconds
const LIFT = 2.8;              // when the throttle closes
function rpmAt(t, p) {         // idle → build to near redline → lift → back to idle
  const peak = p.redline * 0.9;
  if (t < 0.9) return p.idle * (1 + 0.02 * Math.sin(t * 20));
  if (t < 2.5) { const x = (t - 0.9) / 1.6; return p.idle + (peak - p.idle) * (x * x * (3 - 2 * x)); }
  if (t < LIFT) return peak;
  const x = Math.min(1, (t - LIFT) / 1.6);
  return p.idle + (peak - p.idle) * Math.pow(1 - x, 2.2);
}

function noiseBuffer(ctx) {
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function rasp(amount) {        // waveshaper curve: more amount = harsher exhaust
  const n = 2048, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i * 2) / n - 1; curve[i] = ((1 + amount) * x) / (1 + amount * Math.abs(x)); }
  return curve;
}

function playRev(ctx, out, noise, p, stage) {
  const t0 = ctx.currentTime + 0.05, end = t0 + T;
  const s = stage;                                   // 0 = stock … 3
  const nodes = [];
  const track = (n) => { nodes.push(n); return n; };

  // engine core: pulse-like mix of a sawtooth at the firing frequency, a sub rumble and a harmonic
  const bus = track(ctx.createGain());
  // lumpy firing (singles, V-twins, V8s): the volume pulses at half the firing rate
  const lump = track(ctx.createGain()); lump.gain.value = 1 - p.pulse / 2;
  const lfo = track(ctx.createOscillator()); lfo.type = 'sine';
  const lfoDepth = track(ctx.createGain()); lfoDepth.gain.value = p.pulse / 2;
  lfo.connect(lfoDepth).connect(lump.gain); lfo.start(t0); lfo.stop(end + 0.1);
  // the exhaust's own boom: a resonant peak, deeper for bigger engines, unique per model
  const boom = track(ctx.createBiquadFilter());
  boom.type = 'peaking'; boom.frequency.value = p.resonance; boom.Q.value = 1.4 + s * 0.3; boom.gain.value = 6 + s * 2.5;
  const shaper = track(ctx.createWaveShaper());
  shaper.curve = rasp(4 + s * 9 + (p.diesel ? 6 : 0) + (p.cyl <= 2 ? 6 : 0));
  shaper.oversample = '2x';
  const tone = track(ctx.createBiquadFilter());
  tone.type = 'lowpass'; tone.Q.value = 0.9 + s * 0.4;
  const env = track(ctx.createGain());
  bus.connect(shaper).connect(boom).connect(tone).connect(lump).connect(env).connect(out);

  const oscs = [
    { type: 'sawtooth', mult: 1, gain: 0.5 },
    { type: 'square', mult: 0.5, gain: (0.18 + p.rumble * 0.3) + s * 0.05 },     // rumble: bigger engines and open exhausts rumble more
    { type: 'triangle', mult: 2, gain: 0.12 + s * 0.04 },
  ].map(({ type, mult, gain }) => {
    const o = track(ctx.createOscillator()), g = track(ctx.createGain());
    o.type = type; o.detune.value = (Math.random() - 0.5) * 8; g.gain.value = gain;
    o.connect(g).connect(bus); o.start(t0); o.stop(end + 0.1);
    return { o, mult };
  });

  // exhaust hiss / diesel clatter
  const hiss = track(ctx.createBufferSource()); hiss.buffer = noise; hiss.loop = true;
  const hissBand = track(ctx.createBiquadFilter()); hissBand.type = 'bandpass';
  hissBand.frequency.value = p.diesel ? 2600 : 1100 + s * 500; hissBand.Q.value = p.diesel ? 2.5 : 0.8;
  const hissGain = track(ctx.createGain());
  hiss.connect(hissBand).connect(hissGain).connect(out); hiss.start(t0); hiss.stop(end + 0.1);

  // turbo whistle
  let whistle = null, whistleGain = null;
  if (p.turbo) {
    whistle = track(ctx.createOscillator()); whistle.type = 'sine';
    whistleGain = track(ctx.createGain()); whistleGain.gain.value = 0;
    whistle.connect(whistleGain).connect(out); whistle.start(t0); whistle.stop(end + 0.1);
  }

  // automation along the rev, every 25 ms
  env.gain.setValueAtTime(0, t0);
  for (let t = 0; t <= T; t += 0.025) {
    const rpm = rpmAt(t, p), frac = (rpm - p.idle) / (p.redline - p.idle);
    const fire = (rpm / 60) * (p.cyl / 2) * p.pitch;
    const at = t0 + t;
    for (const { o, mult } of oscs) o.frequency.linearRampToValueAtTime(Math.max(20, fire * mult), at);
    lfo.frequency.linearRampToValueAtTime(Math.max(2, (rpm / 60) / 2), at);
    tone.frequency.linearRampToValueAtTime(500 + s * 450 + frac * (2200 + s * 700), at);
    const onThrottle = t < LIFT;
    const level = (t < 0.15 ? t / 0.15 : t > T - 0.35 ? Math.max(0, (T - t) / 0.35) : 1) * (onThrottle ? 0.75 + frac * 0.25 : 0.55);
    env.gain.linearRampToValueAtTime(level, at);
    hissGain.gain.linearRampToValueAtTime((0.02 + s * 0.025 + (p.diesel ? 0.03 : 0)) * (0.4 + frac) * (level > 0 ? 1 : 0), at);
    if (whistle) {
      const boost = onThrottle ? Math.max(0, frac - 0.15) : Math.max(0, frac - 0.5) * 0.3;
      whistle.frequency.linearRampToValueAtTime(1800 + boost * 5200 + s * 300, at);
      whistleGain.gain.linearRampToValueAtTime((0.004 + s * 0.012) * boost * boost * 3, at);
    }
  }

  // blow-off valve when the throttle closes (turbo, Stage 2+)
  const burst = (at, dur, freq, type, q, peak) => {
    const src = track(ctx.createBufferSource()); src.buffer = noise;
    const f = track(ctx.createBiquadFilter()); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = track(ctx.createGain());
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(peak, at + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(out); src.start(at, Math.random()); src.stop(at + dur + 0.05);
  };
  if (p.turbo && s >= 2) burst(t0 + LIFT + 0.05, 0.45, 2200, 'highpass', 0.7, 0.18 + s * 0.04);

  // overrun crackles and pops (petrol, Stage 2+)
  if (p.petrol && s >= 2) {
    const pops = s === 3 ? 10 : 5;
    for (let i = 0; i < pops; i++) burst(t0 + LIFT + 0.15 + Math.random() * 1.3, 0.05 + Math.random() * 0.05, 300 + Math.random() * 500, 'bandpass', 1.2, 0.35 + s * 0.08);
  }

  return () => nodes.forEach((n) => { try { n.stop?.(); } catch { /* already stopped */ } try { n.disconnect(); } catch { /* fine */ } });
}

function Tacho({ rpm, redline }) {
  const frac = Math.min(1, rpm / (redline * 1.05));
  const angle = -120 + frac * 240;
  const ticks = Math.ceil(redline / 1000);
  return (
    <svg viewBox="0 0 120 80" className="h-24 w-36" role="img" aria-label={`${Math.round(rpm)} rpm`}>
      <path d="M15 70 A50 50 0 1 1 105 70" fill="none" stroke="#27272a" strokeWidth="8" strokeLinecap="round" />
      <path d="M15 70 A50 50 0 1 1 105 70" fill="none" stroke="#ef4444" strokeWidth="8" strokeLinecap="round"
        strokeDasharray="236" strokeDashoffset={236 * 0.88} />
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const a = ((-120 + (i / (redline * 1.05 / 1000)) * 240) * Math.PI) / 180;
        return <line key={i} x1={60 + Math.sin(a) * 40} y1={60 - Math.cos(a) * 40} x2={60 + Math.sin(a) * 34} y2={60 - Math.cos(a) * 34} stroke="#71717a" strokeWidth="1.5" />;
      })}
      <line x1="60" y1="60" x2={60 + Math.sin((angle * Math.PI) / 180) * 42} y2={60 - Math.cos((angle * Math.PI) / 180) * 42}
        stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="60" cy="60" r="4" fill="#fbbf24" />
      <text x="60" y="78" textAnchor="middle" fontSize="10" fill="#a1a1aa" fontFamily="monospace">{Math.round(rpm / 10) * 10} rpm</text>
    </svg>
  );
}

export default function EngineSound({ vehicle, stages }) {
  const p = useMemo(() => profileFor(vehicle), [vehicle]);
  const ctxRef = useRef(null), noiseRef = useRef(null), stopRef = useRef(null), rafRef = useRef(0), timerRef = useRef(0);
  const [playing, setPlaying] = useState(null);       // null | 0..3
  const [rpm, setRpm] = useState(p.idle);
  const [error, setError] = useState('');

  const stopAll = () => {
    stopRef.current?.(); stopRef.current = null;
    cancelAnimationFrame(rafRef.current); clearTimeout(timerRef.current);
    setPlaying(null); setRpm(p.idle);
  };
  useEffect(() => () => { stopAll(); ctxRef.current?.close(); }, []);

  const play = (queue) => {
    stopAll();
    let ctx = ctxRef.current;
    try {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        const comp = ctx.createDynamicsCompressor();   // keeps the loud stages from clipping
        comp.threshold.value = -12; comp.ratio.value = 6;
        const master = ctx.createGain(); master.gain.value = 0.22;
        master.connect(comp).connect(ctx.destination);
        ctx.master = master; ctxRef.current = ctx; noiseRef.current = noiseBuffer(ctx);
      }
      ctx.resume();
    } catch {
      setError("Your browser can't play generated sound.");
      return;
    }
    const next = (i) => {
      if (i >= queue.length) { stopAll(); return; }
      const stage = queue[i];
      const stageGain = ctx.createGain(); stageGain.gain.value = 1 + stage * 0.22;   // tuned = louder
      stageGain.connect(ctx.master);
      const stop = playRev(ctx, stageGain, noiseRef.current, p, stage);
      stopRef.current = () => { stop(); stageGain.disconnect(); };
      setPlaying(stage);
      const start = ctx.currentTime + 0.05;
      const tick = () => {
        const t = ctx.currentTime - start;
        if (t >= 0) setRpm(rpmAt(Math.min(t, T), p));
        if (t < T) rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      timerRef.current = setTimeout(() => { stop(); stageGain.disconnect(); next(i + 1); }, (T + 0.5) * 1000);
    };
    next(0);
  };

  const labels = ['Stock', ...stages.map((s) => `Stage ${s.stage}`)];
  return (
    <section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-md">
          <h3 className="font-semibold text-zinc-100">Hear the difference</h3>
          <p className="mt-1 text-sm text-zinc-400">
            A rev from idle to near the redline and back, stock and after each stage. Turn your volume down a little first.
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Sound profile: {describe(p)}. Generated live in your browser from these specs, not a recording.
          </p>
        </div>
        <Tacho rpm={rpm} redline={p.redline} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {labels.map((label, stage) => (
          <button key={label} type="button" onClick={() => (playing === stage ? stopAll() : play([stage]))} aria-pressed={playing === stage}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${playing === stage ? 'bg-amber-400 text-zinc-950' : 'border border-zinc-700 text-zinc-200 hover:border-amber-400 hover:text-amber-300'}`}>
            {playing === stage ? '■ Stop' : `▶ ${label}`}
          </button>
        ))}
        {stages.length > 0 && (
          <button type="button" onClick={() => play([0, stages[stages.length - 1].stage])}
            className="rounded-xl border border-dashed border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:border-amber-400 hover:text-amber-300">
            Compare stock → Stage {stages[stages.length - 1].stage}
          </button>
        )}
      </div>
      {playing !== null && <p className="mt-3 text-sm text-amber-300" aria-live="polite">Playing: {labels[playing]}</p>}
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
    </section>
  );
}
