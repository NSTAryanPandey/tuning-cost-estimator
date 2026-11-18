import { useEffect, useState } from 'react';
import { api } from '../api.js';
import CarImage from './CarImage.jsx';
import SearchBox from './SearchBox.jsx';

// Step-by-step picker: make → model → year → engine, plus city.
// Each choice loads the options for the next dropdown and clears the ones after it.
export default function VehicleForm({ onSubmit, busy }) {
  const [options, setOptions] = useState({ makes: [], models: [], years: [], engines: [], cities: [] });
  const [vehicleClass, setVehicleClass] = useState('car');
  const [pick, setPick] = useState({ make: '', model: '', year: '', vehicleId: '', city: 'Bangalore' });
  const [error, setError] = useState('');
  const [slow, setSlow] = useState(false);

  const set = (patch) => setPick((p) => ({ ...p, ...patch }));
  const setOpts = (patch) => setOptions((o) => ({ ...o, ...patch }));
  const fail = (e) => setError(e.message);

  // First load: cities. A free server can take ~30 s to wake up, so say so.
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 4000);
    api.cities()
      .then((cities) => {
        setOpts({ cities });
        if (!cities.includes('Bangalore') && cities.length) set({ city: cities[0] });
      })
      .catch(fail)
      .finally(() => { clearTimeout(t); setSlow(false); });
    return () => clearTimeout(t);
  }, []);

  // Makes for the chosen class (car or bike). Switching class clears the rest of the form.
  useEffect(() => {
    set({ make: '', model: '', year: '', vehicleId: '' });
    setOpts({ makes: [], models: [], years: [], engines: [] });
    setError('');
    api.makes(vehicleClass).then((makes) => setOpts({ makes })).catch(fail);
  }, [vehicleClass]);

  const chooseMake = (make) => {
    set({ make, model: '', year: '', vehicleId: '' });
    setOpts({ models: [], years: [], engines: [] });
    setError('');
    if (make) api.models(vehicleClass, make).then((models) => setOpts({ models })).catch(fail);
  };

  const chooseModel = (model) => {
    set({ model, year: '', vehicleId: '' });
    setOpts({ years: [], engines: [] });
    if (model) api.years(vehicleClass, pick.make, model).then((years) => setOpts({ years })).catch(fail);
  };

  const chooseYear = (year) => {
    set({ year, vehicleId: '' });
    setOpts({ engines: [] });
    if (year) {
      api.engines(vehicleClass, pick.make, pick.model, year)
        .then((engines) => {
          setOpts({ engines });
          if (engines.length === 1) set({ vehicleId: String(engines[0].vehicle_id) }); // only one engine: pick it
        })
        .catch(fail);
    }
  };

  const ready = pick.vehicleId && pick.city && !busy;
  const chosen = options.engines.find((en) => String(en.vehicle_id) === pick.vehicleId);
  const ENGINE_LABEL = { petrol_turbo: 'Turbo petrol', petrol_na: 'Petrol (non-turbo)', diesel_turbo: 'Turbo diesel', bike_petrol: 'Petrol', ev: 'Electric' };
  const submit = (e) => {
    e.preventDefault();
    if (ready) onSubmit(Number(pick.vehicleId), pick.city);
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 sm:p-6 shadow-xl shadow-black/30">
      <div className="mb-5 inline-flex rounded-xl border border-zinc-700 bg-zinc-950 p-1" role="group" aria-label="Vehicle type">
        {[['car', 'Cars'], ['bike', 'Bikes & scooters']].map(([value, text]) => (
          <button key={value} type="button" onClick={() => setVehicleClass(value)} aria-pressed={vehicleClass === value}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${vehicleClass === value ? 'bg-amber-400 text-zinc-950' : 'text-zinc-400 hover:text-zinc-100'}`}>
            {text}
          </button>
        ))}
      </div>
      <div className="mb-5">
        <SearchBox vehicleClass={vehicleClass} onPick={(hit) => onSubmit(hit.vehicle_id, pick.city)} />
        <div className="mt-4 flex items-center gap-3 text-xs uppercase tracking-wider text-zinc-600">
          <span className="h-px flex-1 bg-zinc-800" />or choose step by step<span className="h-px flex-1 bg-zinc-800" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Select label="Make" value={pick.make} onChange={chooseMake} placeholder="Select make"
          items={options.makes.map((m) => [m, m])} />
        <Select label="Model" value={pick.model} onChange={chooseModel} placeholder="Select model"
          items={options.models.map((m) => [m, m])} disabled={!pick.make} />
        <Select label="Year" value={pick.year} onChange={chooseYear} placeholder="Select year"
          items={options.years.map((y) => [y, y])} disabled={!pick.model} />
        <Select label="Engine" value={pick.vehicleId} onChange={(id) => set({ vehicleId: id })} placeholder="Select engine"
          items={options.engines.map((en) => [en.vehicle_id, `${en.engine_name}${en.stock_hp ? ` · ${en.stock_hp} hp` : ''}`])}
          disabled={!pick.year} />
        <Select label="City (labour rate)" value={pick.city} onChange={(city) => set({ city })} placeholder="Select city"
          items={options.cities.map((c) => [c, c])} />
      </div>

      {pick.model && (
        <div className="mt-5 flex items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-950/60 p-3 sm:gap-6 sm:p-4">
          <CarImage vehicle={{ make: pick.make, model: pick.model, vehicle_class: vehicleClass, body_type: chosen?.body_type ?? options.engines[0]?.body_type, image_url: chosen?.image_url }}
            className="h-16 w-32 shrink-0 sm:h-20 sm:w-40" />
          <div className="min-w-0">
            <div className="font-semibold text-zinc-100">{pick.make} {pick.model}{pick.year ? ` · ${pick.year}` : ''}</div>
            <div className="text-sm text-zinc-400">
              {chosen ? `${chosen.engine_name} · ${ENGINE_LABEL[chosen.engine_type] ?? chosen.engine_type}${chosen.stock_hp ? ` · ${chosen.stock_hp} hp / ${chosen.stock_torque_nm} Nm` : ''}`
                : options.engines.length > 1 ? `${options.engines.length} engines available: pick one` : 'Pick the year to see engines'}
            </div>
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-zinc-400" role="status">
          {error ? <span className="text-red-400">{error}</span>
            : slow ? 'Waking up the server, this can take up to 30 seconds on the free plan…'
            : 'Prices are estimates in INR, including 18% GST.'}
        </p>
        <button type="submit" disabled={!ready}
          className="rounded-xl bg-amber-400 px-6 py-3 font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40">
          {busy ? 'Calculating…' : 'Estimate cost'}
        </button>
      </div>
    </form>
  );
}

function Select({ label, value, onChange, items, placeholder, disabled = false }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wider text-zinc-400">{label}</span>
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
        className="field w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3.5 py-3 pr-9 text-zinc-100 outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 disabled:opacity-40">
        <option value="">{placeholder}</option>
        {items.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
      </select>
    </label>
  );
}
