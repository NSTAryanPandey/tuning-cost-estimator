import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { years } from '../format.js';
import CarImage from './CarImage.jsx';

// Type-ahead search: "classic 350", "creta diesel", "re hunter".
// Arrow keys move through results, Enter picks, Escape closes.
export default function SearchBox({ vehicleClass, onPick }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef(null);

  // Ask the server 200 ms after the user stops typing (debounce), so we don't send a request per key.
  useEffect(() => {
    const text = q.trim();
    if (!text) { setHits([]); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      api.search(text)
        .then((res) => { if (!cancelled) { setHits(res); setActive(0); setOpen(true); } })
        .catch(() => { if (!cancelled) setHits([]); });
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q]);

  // Close the list when clicking outside it.
  useEffect(() => {
    const close = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const pick = (hit) => {
    setQ(`${hit.make} ${hit.model} · ${hit.engine_name}`);
    setOpen(false);
    onPick(hit);
  };

  const onKey = (e) => {
    if (!open || !hits.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => (a + 1) % hits.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + hits.length) % hits.length); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(hits[active]); }
    else if (e.key === 'Escape') setOpen(false);
  };

  const listId = 'search-results';
  return (
    <div ref={boxRef} className="relative">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">Quick search</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} onFocus={() => hits.length && setOpen(true)}
          placeholder={vehicleClass === 'bike' ? 'Try "classic 350", "duke", "activa"…' : 'Try "creta diesel", "thar", "re hunter"…'}
          role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
          className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20" />
      </label>
      {open && q.trim() && (
        <ul id={listId} role="listbox"
          className="absolute z-20 mt-2 max-h-96 w-full overflow-y-auto rounded-xl border border-zinc-700 bg-zinc-900 p-1 shadow-2xl shadow-black/60">
          {hits.length === 0 && <li className="px-3 py-3 text-sm text-zinc-500">No match. Try the make or model name.</li>}
          {hits.map((h, i) => (
            <li key={h.vehicle_id} role="option" aria-selected={i === active}
              onMouseDown={(e) => { e.preventDefault(); pick(h); }} onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 ${i === active ? 'bg-zinc-800' : ''}`}>
              <CarImage vehicle={h} className="h-9 w-[4.5rem] shrink-0" />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-zinc-100">{h.make} {h.model}</div>
                <div className="truncate text-xs text-zinc-400">{h.engine_name} · {years(h)}{h.stock_hp ? ` · ${h.stock_hp} hp` : ''}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
