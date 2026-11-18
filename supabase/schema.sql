-- Automotive Tuning Cost Estimator — database schema (Supabase / PostgreSQL)
-- Run this once in the Supabase SQL editor, then run seed.sql.

-- Engine families decide which parts and tuning rules apply.
create type engine_type as enum ('petrol_turbo', 'petrol_na', 'diesel_turbo', 'bike_petrol', 'ev');
create type vehicle_class as enum ('car', 'bike');

-- One row per model + engine + year range (e.g. "Hyundai Verna 1.5 Turbo GDi, 2023–present").
-- Ids: cars from 1, bikes from 1001 (same as the CSV files).
create table vehicles (
  id               integer primary key,
  vehicle_class    vehicle_class not null default 'car',
  make             text        not null,
  model            text        not null,
  engine_name      text        not null,          -- shown to the user, e.g. "1.5 Turbo GDi"
  engine_type      engine_type not null,
  year_from        smallint    not null,
  year_to          smallint,                      -- null = still on sale
  stock_hp         numeric(6,1),                  -- one decimal for small bikes (8.0 hp)
  stock_torque_nm  numeric(6,1),
  parts_multiplier numeric(4,2) not null default 1.00,  -- premium cars: parts cost more
  body_type        text        not null default 'sedan'
                   check (body_type in ('hatchback', 'sedan', 'suv', 'mpv', 'pickup',
                                        'scooter', 'commuter', 'naked', 'sport', 'cruiser', 'adventure')),
  image_url        text,                          -- optional photo (your own or properly licensed)
  check (year_to is null or year_to >= year_from),
  check (parts_multiplier > 0)
);
create index vehicles_class_make_model_idx on vehicles (vehicle_class, make, model);

-- Labour hours, ECU licence fee and expected power gain for each stage, per engine family.
-- Hours are what this stage ADDS on top of the previous stage.
create table stage_rules (
  engine_type          engine_type not null,
  stage                smallint    not null check (stage between 1 and 3),
  labour_hours_min     numeric(4,1) not null,
  labour_hours_max     numeric(4,1) not null,
  ecu_fee_min          integer     not null default 0,
  ecu_fee_max          integer     not null default 0,
  hp_gain_pct_min      smallint    not null,
  hp_gain_pct_max      smallint    not null,
  torque_gain_pct_min  smallint    not null,
  torque_gain_pct_max  smallint    not null,
  software_label       text        not null default 'ECU remap licence',
  labour_rate_factor   numeric(3,2) not null default 1.00,   -- bikes: about half the car labour rate
  primary key (engine_type, stage),
  check (labour_hours_max >= labour_hours_min and ecu_fee_max >= ecu_fee_min)
);

-- Hardware and services. engine_types lists which engine families a part fits.
create table parts (
  id           serial primary key,
  name         text          not null,
  category     text          not null,            -- 'part' or 'service'
  stage        smallint      not null check (stage between 1 and 3),
  price_min    integer       not null,
  price_max    integer       not null,
  engine_types engine_type[] not null,
  check (price_max >= price_min)
);

-- Workshop labour rate per city (₹ per hour).
create table labour_rates (
  city      text primary key,
  rate_min  integer not null,
  rate_max  integer not null,
  check (rate_max >= rate_min)
);

-- Saved quotes, so a result can be shared by link (/q/AB12CD).
create table estimates (
  code        text primary key,
  vehicle_id  integer not null references vehicles (id),
  city        text    not null references labour_rates (city),
  result      jsonb   not null,
  created_at  timestamptz not null default now()
);

-- Security: anyone can READ the price catalogue, nobody can change it from the browser.
-- Saved quotes are written only by the backend (service role key bypasses these rules).
alter table vehicles     enable row level security;
alter table stage_rules  enable row level security;
alter table parts        enable row level security;
alter table labour_rates enable row level security;
alter table estimates    enable row level security;

create policy "public read" on vehicles     for select using (true);
create policy "public read" on stage_rules  for select using (true);
create policy "public read" on parts        for select using (true);
create policy "public read" on labour_rates for select using (true);
create policy "public read" on estimates    for select using (true);

-- Accounts for "My Garage". Passwords are stored only as PBKDF2 hashes (see backend/app/auth.py).
create table app_users (
  id             uuid primary key default gen_random_uuid(),
  email          text not null unique check (email = lower(email)),
  password_hash  text not null,
  created_at     timestamptz not null default now()
);

-- Vehicles a user saved, with an optional target stage and notes.
create table garage_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references app_users (id) on delete cascade,
  vehicle_id    integer not null references vehicles (id),
  city          text not null references labour_rates (city),
  nickname      text check (char_length(nickname) <= 60),
  target_stage  smallint check (target_stage between 1 and 3),
  notes         text check (char_length(notes) <= 500),
  created_at    timestamptz not null default now()
);
create index garage_items_user_idx on garage_items (user_id, created_at desc);

-- No public policies: only the backend (service role key) can read or write accounts and garages.
alter table app_users    enable row level security;
alter table garage_items enable row level security;
