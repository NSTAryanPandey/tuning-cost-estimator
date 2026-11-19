import { useEffect, useState } from 'react';
import { api } from '../api.js';
import CarImage from './CarImage.jsx';

// Real photo of the model (free licence, from Wikimedia Commons) with its required credit.
// While loading, or if there's no free photo, the drawn outline is shown instead.
const cache = new Map();   // vehicle id -> photo | null, so each photo is asked for once per visit

export default function VehiclePhoto({ vehicle, className = '', showCredit = true }) {
  const [photo, setPhoto] = useState(cache.get(vehicle?.id));
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    if (!vehicle?.id || cache.has(vehicle.id)) { setPhoto(cache.get(vehicle?.id)); return; }
    let alive = true;
    api.photo(vehicle.id)
      .then((r) => { cache.set(vehicle.id, r.photo); if (alive) setPhoto(r.photo); })
      .catch(() => { if (alive) setPhoto(null); });
    return () => { alive = false; };
  }, [vehicle?.id]);

  if (!photo || broken) {
    return <CarImage vehicle={vehicle} className={className} />;
  }
  const credit = [photo.artist, photo.license].filter(Boolean).join(' · ');
  return (
    <figure className={`relative overflow-hidden rounded-xl bg-zinc-900 ${className}`}>
      <img src={photo.url} alt={`${vehicle.make} ${vehicle.model} (photo of ${photo.article})`} loading="lazy"
        onError={() => setBroken(true)} className="h-full w-full object-cover" />
      {showCredit && photo.source !== 'own' && (
        <figcaption className="absolute inset-x-0 bottom-0 truncate bg-black/65 px-2 py-0.5 text-[10px] leading-4 text-zinc-300">
          <a href={photo.page_url} target="_blank" rel="noreferrer" className="hover:text-white hover:underline" title={`Photo of ${photo.article}. ${credit}. Wikimedia Commons`}>
            Photo: {photo.article}{credit ? ` · ${credit}` : ''}
          </a>
        </figcaption>
      )}
    </figure>
  );
}
