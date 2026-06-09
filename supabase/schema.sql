create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null default 'mobile',
  created_at timestamptz not null default now()
);

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  accuracy double precision,
  created_at timestamptz not null default now()
);

create index if not exists locations_device_created_idx
  on public.locations (device_id, created_at desc);

alter table public.devices enable row level security;
alter table public.locations enable row level security;

drop policy if exists "Users can read own devices" on public.devices;
create policy "Users can read own devices"
  on public.devices for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create own devices" on public.devices;
create policy "Users can create own devices"
  on public.devices for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own devices" on public.devices;
create policy "Users can update own devices"
  on public.devices for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own devices" on public.devices;
create policy "Users can delete own devices"
  on public.devices for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can read own locations" on public.locations;
create policy "Users can read own locations"
  on public.locations for select
  using (auth.uid() = user_id);

drop policy if exists "Users can create own locations" on public.locations;
create policy "Users can create own locations"
  on public.locations for insert
  with check (auth.uid() = user_id);
