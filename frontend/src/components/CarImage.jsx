import { useId } from 'react';

// Shows the vehicle's photo if one is set (image_url), otherwise an original side-view outline
// drawn for its body type (cars and bikes). The colour comes from the make's name, so each
// brand gets its own consistent colour.

const SHAPES = {
  sedan: {
    body: 'M14 80 L16 68 Q18 60 28 58 L72 54 L98 36 Q104 32 114 32 L150 32 Q160 32 168 38 L186 54 L214 58 Q226 60 228 70 L228 80 Q228 84 224 84 L211 84 A19 19 0 0 0 173 84 L83 84 A19 19 0 0 0 45 84 L18 84 Q14 84 14 80 Z',
    windows: ['M84 53 L104 39 Q106 37 110 37 L131 37 L131 53 Z', 'M136 37 L150 37 Q157 37 162 42 L175 53 L136 53 Z'],
    wheels: [[64, 84], [192, 84]], r: 16, head: [218, 63], tail: [17, 64],
  },
  hatchback: {
    body: 'M18 80 L19 56 Q20 40 34 38 L144 36 Q152 36 158 42 L176 56 L204 60 Q216 62 218 72 L218 80 Q218 84 214 84 L199 84 A18 18 0 0 0 163 84 L75 84 A18 18 0 0 0 39 84 L22 84 Q18 84 18 80 Z',
    windows: ['M28 54 L35 43 Q37 41 42 41 L92 41 L92 54 Z', 'M98 41 L142 41 Q148 41 152 45 L163 54 L98 54 Z'],
    wheels: [[57, 84], [181, 84]], r: 15, head: [208, 65], tail: [20, 60],
  },
  suv: {
    body: 'M12 82 L12 52 Q12 30 28 28 L146 26 Q154 26 160 32 L180 52 L220 57 Q230 59 230 69 L230 82 Q230 86 226 86 L213 86 A20 20 0 0 0 173 86 L81 86 A20 20 0 0 0 41 86 L16 86 Q12 86 12 82 Z',
    windows: ['M22 52 L22 38 Q22 33 28 33 L84 32 L84 52 Z', 'M90 32 L144 31 Q150 31 155 36 L171 52 L90 52 Z'],
    wheels: [[61, 86], [193, 86]], r: 18, head: [220, 64], tail: [14, 58], rails: true,
  },
  mpv: {
    body: 'M12 82 L12 50 Q12 30 28 28 L150 26 Q160 26 168 34 L198 58 L222 62 Q230 64 230 72 L230 82 Q230 86 226 86 L213 86 A19 19 0 0 0 175 86 L79 86 A19 19 0 0 0 41 86 L16 86 Q12 86 12 82 Z',
    windows: ['M22 52 L22 38 Q22 33 28 33 L66 32 L66 52 Z', 'M72 32 L112 31 L112 52 L72 52 Z', 'M118 31 L148 30 Q156 30 162 36 L180 52 L118 52 Z'],
    wheels: [[60, 86], [194, 86]], r: 17, head: [221, 68], tail: [14, 58],
  },
  pickup: {
    body: 'M12 82 L12 56 L104 56 L106 34 Q107 28 114 28 L168 27 Q176 27 182 33 L202 54 L222 58 Q230 60 230 70 L230 82 Q230 86 226 86 L213 86 A20 20 0 0 0 173 86 L81 86 A20 20 0 0 0 41 86 L16 86 Q12 86 12 82 Z',
    windows: ['M112 52 L113 36 Q114 33 118 33 L140 33 L140 52 Z', 'M146 33 L166 32 Q172 32 177 37 L192 52 L146 52 Z'],
    wheels: [[61, 86], [193, 86]], r: 18, head: [220, 64], tail: [14, 62], bed: true,
  },
};

function hueFor(text = '') {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

const BIKE_BODIES = new Set(['scooter', 'commuter', 'naked', 'sport', 'cruiser', 'adventure']);
const CHROME = '#a1a1aa', FRAME = '#52525b', SEAT = '#18181b';

function Wheel({ cx, cy = 80, r = 20 }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#18181b" strokeWidth={r * 0.32} />
      <circle cx={cx} cy={cy} r={r * 0.78} fill="none" stroke="#71717a" strokeWidth="1.5" />
      <circle cx={cx} cy={cy} r={r * 0.18} fill={CHROME} />
    </g>
  );
}

function Bike({ body, paint, label }) {
  const common = <ellipse cx="122" cy="100" rx="96" ry="3.5" fill="black" opacity="0.45" />;
  if (body === 'scooter') {
    return (
      <svg viewBox="0 0 244 104" role="img" aria-label={label} className="h-full w-full">
        {common}
        <Wheel cx={62} cy={86} r={14} /><Wheel cx={184} cy={86} r={14} />
        <path d="M40 82 Q38 56 68 52 L124 52 Q132 54 132 64 L150 64 L158 34 L170 32 L174 38 L168 68 Q186 70 192 84 L46 86 Z" fill={paint} stroke="black" strokeOpacity="0.25" />
        <path d="M62 44 L120 44 Q126 46 122 52 L64 52 Q58 50 62 44 Z" fill={SEAT} />
        <path d="M154 28 L178 25" stroke={CHROME} strokeWidth="3" strokeLinecap="round" />
        <rect x="166" y="38" width="9" height="5" rx="2" fill="#fde68a" />
      </svg>
    );
  }
  if (body === 'cruiser') {
    return (
      <svg viewBox="0 0 244 104" role="img" aria-label={label} className="h-full w-full">
        {common}
        <Wheel cx={52} /><Wheel cx={196} />
        <path d="M30 70 Q50 46 76 62" stroke={paint} strokeWidth="6" fill="none" strokeLinecap="round" />
        <path d="M52 80 L108 74" stroke={FRAME} strokeWidth="4" />
        <path d="M196 80 L168 26" stroke={CHROME} strokeWidth="4" strokeLinecap="round" />
        <rect x="104" y="54" width="44" height="26" rx="5" fill="#3f3f46" />
        <path d="M150 82 L64 86" stroke={CHROME} strokeWidth="5" strokeLinecap="round" />
        <path d="M112 46 Q120 32 144 34 Q158 36 154 48 Z" fill={paint} />
        <path d="M60 54 Q84 46 110 50 L110 56 L66 60 Z" fill={SEAT} />
        <path d="M160 22 L172 17 L182 25" stroke={CHROME} strokeWidth="3" fill="none" strokeLinecap="round" />
        <circle cx="180" cy="38" r="6" fill="#fde68a" />
      </svg>
    );
  }
  if (body === 'sport') {
    return (
      <svg viewBox="0 0 244 104" role="img" aria-label={label} className="h-full w-full">
        {common}
        <Wheel cx={58} /><Wheel cx={188} />
        <path d="M58 80 L112 70" stroke={FRAME} strokeWidth="4" />
        <path d="M188 80 L170 34" stroke={CHROME} strokeWidth="4" strokeLinecap="round" />
        <path d="M84 46 L120 38 L160 26 Q178 24 188 38 L190 52 Q176 64 146 66 L112 68 L96 58 Z" fill={paint} stroke="black" strokeOpacity="0.25" />
        <path d="M158 26 L172 15 L183 30 Z" fill="#0b1220" />
        <path d="M64 40 L102 35 L104 42 L70 46 Z" fill={SEAT} />
        <path d="M46 33 L68 37 L70 44 L54 44 Z" fill={paint} />
        <path d="M122 76 L92 80" stroke={CHROME} strokeWidth="5" strokeLinecap="round" />
        <rect x="180" y="40" width="9" height="4" rx="2" fill="#fde68a" />
      </svg>
    );
  }
  const adv = body === 'adventure', commuter = body === 'commuter';
  return (
    <svg viewBox="0 0 244 104" role="img" aria-label={label} className="h-full w-full">
      {common}
      <Wheel cx={58} /><Wheel cx={186} r={adv ? 21 : 20} />
      <path d="M58 80 L112 72" stroke={FRAME} strokeWidth="4" />
      <path d={adv ? 'M186 80 L164 22' : 'M186 80 L166 30'} stroke={CHROME} strokeWidth="4" strokeLinecap="round" />
      <path d="M100 50 L164 34 M100 50 L112 72" stroke={FRAME} strokeWidth="4" />
      <rect x="102" y="56" width="40" height="24" rx="4" fill="#3f3f46" />
      {[108, 116, 124].map((x) => <path key={x} d={`M${x} 58 L${x} 70`} stroke="#71717a" strokeWidth="1.5" />)}
      <path d={adv ? 'M108 58 L80 52 L64 52' : 'M120 78 L86 80 L70 74'} stroke={CHROME} strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d={commuter ? 'M112 48 Q120 36 146 36 L160 38 Q166 42 162 48 L130 54 Z' : 'M112 44 Q120 30 146 30 L162 32 Q168 36 164 44 L130 52 Z'} fill={paint} />
      <path d={adv ? 'M70 40 L114 36 L116 42 L76 46 Q66 46 70 40 Z' : 'M70 46 L114 42 L116 48 L76 52 Q66 52 70 46 Z'} fill={SEAT} />
      <path d={adv ? 'M52 38 L72 38 L74 44 L56 44 Z' : 'M54 44 L72 44 L74 50 L58 50 Z'} fill={paint} />
      {adv && <path d="M160 26 L168 10 L176 14 L170 30 Z" fill="#0b1220" opacity="0.85" />}
      <path d={adv ? 'M152 20 L174 17' : 'M156 25 L176 22'} stroke={CHROME} strokeWidth="3" strokeLinecap="round" />
      <circle cx={adv ? 172 : 174} cy={adv ? 32 : 37} r="5" fill="#fde68a" />
      {commuter && <path d="M168 62 Q186 52 204 64" stroke={paint} strokeWidth="4" fill="none" />}
    </svg>
  );
}

export default function CarImage({ vehicle, className = '' }) {
  const id = useId().replace(/:/g, '');
  if (vehicle?.image_url) {
    return <img src={vehicle.image_url} alt={`${vehicle.make} ${vehicle.model}`} className={`object-contain ${className}`} loading="lazy" />;
  }
  const label = `${vehicle?.make ?? ''} ${vehicle?.model ?? ''} (${vehicle?.body_type ?? 'vehicle'} outline)`;
  const isBike = BIKE_BODIES.has(vehicle?.body_type) || (vehicle?.vehicle_class === 'bike' && !vehicle?.body_type);
  if (isBike) {
    return (
      <div className={className}>
        <Bike body={vehicle?.body_type ?? 'naked'} paint={`hsl(${hueFor(vehicle?.make)} 60% 50%)`} label={label} />
      </div>
    );
  }
  const s = SHAPES[vehicle?.body_type] ?? SHAPES.sedan;
  const hue = hueFor(vehicle?.make);
  const paint = `hsl(${hue} 55% 52%)`, paintDark = `hsl(${hue} 55% 30%)`;
  return (
    <svg viewBox="0 0 244 104" className={className} role="img" aria-label={label}>
      <defs>
        <linearGradient id={`paint-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={paint} />
          <stop offset="1" stopColor={paintDark} />
        </linearGradient>
      </defs>
      <ellipse cx="122" cy="100" rx="110" ry="4" fill="black" opacity="0.45" />
      {s.rails && <path d="M36 25 L140 23" stroke="#71717a" strokeWidth="2.5" strokeLinecap="round" />}
      <path d={s.body} fill={`url(#paint-${id})`} stroke={paintDark} strokeWidth="1.2" strokeLinejoin="round" />
      {s.bed && <path d="M14 61 L102 61" stroke={paintDark} strokeWidth="1.5" />}
      {s.windows.map((d) => <path key={d} d={d} fill="#0b1220" stroke="#1f2937" strokeWidth="0.8" opacity="0.92" />)}
      <rect x={s.head[0]} y={s.head[1]} width="8" height="4" rx="2" fill="#fde68a" />
      <rect x={s.tail[0]} y={s.tail[1]} width="4" height="6" rx="1.5" fill="#ef4444" />
      {s.wheels.map(([cx, cy]) => (
        <g key={cx}>
          <circle cx={cx} cy={cy} r={s.r} fill="#18181b" stroke="#3f3f46" strokeWidth="1.5" />
          <circle cx={cx} cy={cy} r={s.r * 0.5} fill="#a1a1aa" />
          <circle cx={cx} cy={cy} r={s.r * 0.15} fill="#3f3f46" />
        </g>
      ))}
    </svg>
  );
}
