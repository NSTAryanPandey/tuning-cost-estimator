# Automotive Tuning Cost Estimator

Pick a car or bike from 312 variants sold in India (184 cars, 128 bikes and scooters) by make, model, year and engine, and a city, and get a cost range for performance tuning in three stages:

**Cars**

| Stage | What's included |
|---|---|
| **Stage 1 · Software only** | ECU remap licence + 2 h workshop labour |
| **Stage 2 · Hardware + software** | Stage 1 + bolt-on parts (high-flow intake, downpipe) + 4–5 h labour |
| **Stage 3 · Full build** | Stage 2 + upgraded turbo, forged internals, custom dyno session + 8–12 h labour |

**Bikes and scooters**

| Stage | What's included |
|---|---|
| **Stage 1 · Fuel + intake** | Fuel controller / ECU flash + performance air filter + 1–1.5 h labour |
| **Stage 2 · Exhaust + remap** | Stage 1 + full exhaust system + 2–3 h labour |
| **Stage 3 · Big-bore build** | Stage 2 + big-bore kit, performance camshaft, dyno session + 6–10 h labour |

Bike labour is charged at half the city's car labour rate.

Each stage also shows the expected power and torque after tuning.

> Prices are sample estimates for demonstration, not real quotes.

## Features

- **Cars and bikes:** separate makes, models, stage rules, parts and labour rates for each.
- **Engine-aware pricing:** parts only appear if they fit the engine. A non-turbo engine gets an exhaust header and a turbo conversion kit instead of a downpipe and turbo upgrade. Electric cars and scooters are flagged as not tunable.
- **Ranges, not fake-precise numbers:** every cost is min–max, rounded to ₹500.
- **City-based labour rates**, a **premium-car parts multiplier**, 18% GST, and a 10% contingency on Stage 3.
- **Quick search:** type "creta diesel", "classic 350" or "re hunter" instead of using the dropdowns.
- **Budget planner:** enter a budget and get the upgrade combination with the most power for that money. Dependencies are respected (software first; Stage 3 parts need Stage 2 parts and a dyno session). It checks every valid combination and also shows the next upgrade and its extra cost (`backend/app/budget.py`).
- **Dyno graph:** power and torque curves against RPM for stock vs each stage. The curve shapes depend on engine type (flat turbo plateau, early diesel peak, high-revving bikes).
- **Hear the difference:** a synthesized engine rev for stock and each stage, made live with the Web Audio API (no recordings). Every vehicle gets its own sound from its specs: engine layout (single, parallel twin, V-twin, boxer, triple, inline-4/6, flat-six, V8), displacement, redline and a per-model exhaust voice; firing frequency comes from rpm and cylinder count; tuned stages get more exhaust rasp, a turbo whistle and blow-off on turbo engines, and overrun crackles on petrol engines (`frontend/src/components/EngineSound.jsx`).
- **My Garage (accounts):** sign up, save vehicles with a nickname, goal stage and notes, and see today's price for your goal. Passwords are hashed with PBKDF2 (310,000 iterations, random salt), logins use signed tokens that expire after 7 days, and repeated failed logins are rate-limited (`backend/app/auth.py`, standard library only).
- **Shareable quotes:** each estimate gets a 6-character code.
- **Runs without a database:** with no Supabase settings, the API uses the bundled sample data.

## Vehicle data

All vehicles live in two spreadsheet-style files, so adding one is just adding a row:

- `backend/app/data/cars.csv` (ids from 1)
- `backend/app/data/bikes.csv` (ids from 1001)

Columns: `id, vehicle_class, make, model, engine_name, engine_type, year_from, year_to, stock_hp, stock_torque_nm, parts_multiplier, body_type`. Leave `year_to` empty for models still on sale. Give a new row the next free id, and never reuse or change an existing id (shared quotes point to it).

Prices, labour rates and stage rules are in `backend/app/data/catalogue.json`. After editing any of these, run `python scripts/make_seed_sql.py` to regenerate the Supabase seed.

Engine figures are approximate manufacturer numbers and may be out of date for some models. Check before relying on them.

## Car and bike pictures

Each vehicle shows an original side-view outline for its body type (cars: hatchback, sedan, SUV, MPV, pickup; bikes: scooter, commuter, naked, sport, cruiser, adventure), drawn in SVG (`frontend/src/components/CarImage.jsx`) and coloured per brand.
**Real photos:** the results page and My Garage show a real photo of the model from **Wikimedia Commons**. Only freely licensed images are used (Creative Commons or public domain, via Wikipedia's `pilicense=free`), and each photo shows its required credit (photographer, licence, link to the original). The photo shows the model, which may be a different year or market version; the caption names the Wikipedia article it came from. If no free photo exists, the outline is shown (`backend/app/photos.py`, endpoint `GET /api/photo/{vehicle_id}`).

To use your own photo for a vehicle, set `image_url` in the CSV. Don't copy carmaker or website photos without permission.

## Tech stack (zero cost)

| Layer | Tech | Free hosting |
|---|---|---|
| Frontend | React + Tailwind CSS | Vercel / Netlify |
| Backend | Python FastAPI | Render |
| Database | PostgreSQL | Supabase |

```
React (browser) ──REST/JSON──▶ FastAPI ──REST──▶ Supabase Postgres
                                  │
                         pricing.py (pure logic, unit-tested)
```

## Project structure

```
frontend/
  src/
    App.jsx               page layout, shared-link loading
    api.js                calls to the backend
    format.js             Indian rupee formatting (₹1,52,500)
    components/
      VehicleForm.jsx     Car/Bike switch, make → model → year → engine → city dropdowns
      SearchBox.jsx       type-ahead search with keyboard navigation
      BudgetPlanner.jsx   "what can I do with ₹X?" planner
      DynoChart.jsx       power/torque vs RPM chart
      AuthPanel.jsx       log in / create account
      SaveToGarage.jsx    save the current vehicle with a goal and notes
      Garage.jsx          My Garage page
      StageCard.jsx       one card per stage: cost + power
      CostChart.jsx       stacked bars: software, parts, labour, tax
      Breakdown.jsx       line-by-line table for the chosen stage
      Result.jsx          puts the result view together
backend/
  app/
    pricing.py      pricing engine: pure Python, no framework, fully tested
    budget.py       budget planner: best upgrades within a budget
    auth.py         password hashing, signed login tokens, login rate limit
    repository.py   data access: local JSON or Supabase, same interface
    main.py         FastAPI routes
    data/cars.csv        car models + engines
    data/bikes.csv       bike and scooter models + engines
    data/catalogue.json  stage rules, parts, labour rates
  tests/            pytest tests for the pricing engine and the API
supabase/
  schema.sql        tables, constraints, row-level security
  seed.sql          generated from the data files
scripts/
  make_seed_sql.py  regenerates seed.sql after you edit the data files
```

## Run locally

You need two Terminal windows: one for the backend, one for the frontend.

**Backend** (http://localhost:8000):

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
pytest -q                          # run the tests
uvicorn app.main:app --reload      # start the API
```

Open http://localhost:8000/docs to try every endpoint in the browser.

**Frontend** (http://localhost:5173):

```bash
cd frontend
npm install
npm run dev
```

In development, the Vite dev server forwards `/api` requests to `http://localhost:8000`, so no CORS setup is needed. For production, set `VITE_API_URL` to the deployed backend URL.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/makes?vehicle_class=car` | list of makes (`car` or `bike`) |
| GET | `/api/models?make=&vehicle_class=` | models for a make |
| GET | `/api/years?make=&model=` | available years |
| GET | `/api/engines?make=&model=&year=` | engine options (each has a `vehicle_id`) |
| GET | `/api/search?q=` | type-ahead search across cars and bikes |
| GET | `/api/cities` | cities with labour rates |
| POST | `/api/estimate` | `{ "vehicle_id": 1, "city": "Bangalore" }` → stages 1–3 with full breakdown |
| GET | `/api/estimate/{code}` | a previously shared quote |
| POST | `/api/auth/signup`, `/api/auth/login` | `{ "email", "password" }` → `{ token, user }` |
| GET | `/api/me` | the logged-in user (header `Authorization: Bearer <token>`) |
| GET / POST | `/api/garage` | list / save vehicles in My Garage |
| DELETE | `/api/garage/{id}` | remove a saved vehicle (only your own) |
| POST | `/api/budget` | `{ "vehicle_id": 1, "city": "Bangalore", "budget": 100000, "basis": "typical" }` → best upgrades within budget |

## Connect Supabase

1. Create a free project at supabase.com.
2. In **SQL Editor**, run `supabase/schema.sql`, then `supabase/seed.sql`.
3. Set environment variables for the backend (see `backend/.env.example`): `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`.
   The service key must stay on the server. Never put it in the frontend or commit it to GitHub.

## Deploy (free)

1. **Database:** Supabase, as above.
2. **Backend:** on Render, create a Web Service from the repo with root directory `backend`, build command `pip install -r requirements.txt`, start command `uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Add `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ALLOWED_ORIGINS` (your frontend URL) and `AUTH_SECRET` (a long random string, e.g. from `python -c "import secrets; print(secrets.token_urlsafe(48))"`). Without `AUTH_SECRET` anyone could forge login tokens.
3. **Frontend:** on Vercel, import the repo with root directory `frontend` and add `VITE_API_URL` = your Render backend URL.

The free Render server sleeps when idle, so the first request can take about 30 seconds. The page tells the user when that happens.

## Security

Row-level security is on for every table. Anyone can read the price catalogue, but nobody can change it from the browser. Quotes, accounts and garages are read and written only by the backend using the service key, and every garage query is filtered by the logged-in user's id.

Passwords are never stored or logged in plain text. Login errors don't reveal whether an email is registered. In local development, accounts are kept in `backend/.local_db.json` (ignored by git).

## Disclaimer

Estimates only. Tuning can affect warranty, insurance and emission compliance.
