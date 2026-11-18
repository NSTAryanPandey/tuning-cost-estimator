// Small wrapper around fetch for the FastAPI backend.
// Empty in development: requests go to the Vite dev server, which forwards them to the backend.
// In production set VITE_API_URL to the deployed backend, e.g. https://tuning-api.onrender.com
const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

// Login token (see backend/app/auth.py). Kept in localStorage so you stay logged in after a refresh.
const TOKEN_KEY = 'tce_token';
export const session = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ } },
};

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function request(path, options = {}) {
  let res;
  const token = session.get();
  try {
    res = await fetch(BASE + path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers },
    });
  } catch {
    throw new ApiError("Can't reach the server. Is the backend running?", 0);
  }
  if (res.status === 204) return null;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    // FastAPI sends { detail: "message" } or a list of validation errors
    const detail = body?.detail;
    const message = typeof detail === 'string' ? detail
      : Array.isArray(detail) && detail[0]?.msg ? detail[0].msg : `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return body;
}

const q = (params) => '?' + new URLSearchParams(params).toString();

export const api = {
  makes: (vehicle_class) => request('/api/makes' + q({ vehicle_class })),
  models: (vehicle_class, make) => request('/api/models' + q({ vehicle_class, make })),
  years: (vehicle_class, make, model) => request('/api/years' + q({ vehicle_class, make, model })),
  engines: (vehicle_class, make, model, year) => request('/api/engines' + q({ vehicle_class, make, model, year })),
  cities: () => request('/api/cities'),
  search: (text, vehicle_class) => request('/api/search' + q(vehicle_class ? { q: text, vehicle_class } : { q: text })),
  budget: (vehicle_id, city, budget, basis) => request('/api/budget', { method: 'POST', body: JSON.stringify({ vehicle_id, city, budget, basis }) }),
  estimate: (vehicle_id, city) => request('/api/estimate', { method: 'POST', body: JSON.stringify({ vehicle_id, city }) }),
  shared: (code) => request('/api/estimate/' + encodeURIComponent(code)),
  signup: (email, password) => request('/api/auth/signup', { method: 'POST', body: JSON.stringify({ email, password }) }),
  login: (email, password) => request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => request('/api/me'),
  garage: () => request('/api/garage'),
  saveToGarage: (item) => request('/api/garage', { method: 'POST', body: JSON.stringify(item) }),
  removeFromGarage: (id) => request('/api/garage/' + encodeURIComponent(id), { method: 'DELETE' }),
};
