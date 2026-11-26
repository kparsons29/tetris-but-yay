-- Run once in the Supabase SQL Editor. Never expose the service-role key in the browser.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[A-Za-z0-9_]{3,16}$')
);
create unique index if not exists profiles_username_lower_unique on public.profiles (lower(username));

create table if not exists public.player_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.match_results (
  id uuid primary key default gen_random_uuid(),
  room_id text not null,
  winner_id uuid references public.profiles(id) on delete set null,
  loser_id uuid references public.profiles(id) on delete set null,
  winner_username text not null,
  loser_username text not null,
  winner_stats jsonb not null default '{}'::jsonb,
  loser_stats jsonb not null default '{}'::jsonb,
  played_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.player_settings enable row level security;
alter table public.match_results enable row level security;

drop policy if exists "Signed-in players can view profiles" on public.profiles;
create policy "Signed-in players can view profiles" on public.profiles for select to authenticated using (true);
drop policy if exists "Players update their own profile" on public.profiles;
create policy "Players update their own profile" on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "Players read their own settings" on public.player_settings;
create policy "Players read their own settings" on public.player_settings for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Players insert their own settings" on public.player_settings;
create policy "Players insert their own settings" on public.player_settings for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Players update their own settings" on public.player_settings;
create policy "Players update their own settings" on public.player_settings for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Signed-in players can view match history" on public.match_results;
create policy "Signed-in players can view match history" on public.match_results for select to authenticated using (true);

grant select, update on public.profiles to authenticated;
grant select, insert, update on public.player_settings to authenticated;
grant select on public.match_results to authenticated;

create or replace function public.handle_new_stacklab_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_username text;
begin
  requested_username := trim(coalesce(new.raw_user_meta_data ->> 'username', ''));
  if requested_username !~ '^[A-Za-z0-9_]{3,16}$' then
    requested_username := 'player_' || left(replace(new.id::text, '-', ''), 8);
  end if;
  insert into public.profiles (id, username) values (new.id, requested_username);
  return new;
end;
$$;

drop trigger if exists on_stacklab_auth_user_created on auth.users;
create trigger on_stacklab_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_stacklab_user();
