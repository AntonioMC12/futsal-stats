begin;

-- Public user metadata is deliberately minimal. Authentication credentials and
-- OTP delivery remain exclusively in Supabase Auth.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.profiles (id, display_name, created_at, updated_at)
select
  users.id,
  nullif(coalesce(users.raw_user_meta_data ->> 'display_name', users.raw_user_meta_data ->> 'name'), ''),
  users.created_at,
  now()
from auth.users users
on conflict (id) do nothing;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'name'), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists auth_user_profile_created on auth.users;
create trigger auth_user_profile_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

alter table public.profiles enable row level security;
revoke all on table public.profiles from public, anon, authenticated;
grant select, update on table public.profiles to authenticated;

drop policy if exists profiles_read_own on public.profiles;
create policy profiles_read_own on public.profiles for select to authenticated
  using (id = auth.uid());
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create or replace function private.set_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profile_set_updated_at on public.profiles;
create trigger profile_set_updated_at
  before update on public.profiles
  for each row execute function private.set_profile_updated_at();

alter table public.teams add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.teams alter column created_by set default auth.uid();
update public.teams team
set created_by = (
  select candidate.auth_user_id
  from public.team_memberships candidate
  where candidate.team_id = team.id and candidate.role = 'owner'
  order by candidate.created_at
  limit 1
)
where team.created_by is null
  and exists (
    select 1 from public.team_memberships candidate
    where candidate.team_id = team.id and candidate.role = 'owner'
  );
create index if not exists teams_created_by_idx on public.teams(created_by);

alter table public.matches add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.matches alter column created_by set default auth.uid();
update public.matches match_row
set created_by = team.created_by
from public.teams team
where team.id = match_row.team_id and match_row.created_by is null;
create index if not exists matches_created_by_idx on public.matches(created_by);

alter table public.team_memberships
  add column if not exists id uuid default extensions.gen_random_uuid();
update public.team_memberships set id = extensions.gen_random_uuid() where id is null;
alter table public.team_memberships alter column id set not null;
create unique index if not exists team_memberships_id_idx on public.team_memberships(id);
alter table public.team_memberships add column if not exists updated_at timestamptz not null default now();

alter table public.match_events add column if not exists team_id uuid references public.teams(id) on delete restrict;
alter table public.match_events add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.match_events alter column created_by set default auth.uid();
update public.match_events event_row
set team_id = match_row.team_id,
    created_by = coalesce(event_row.created_by, match_row.created_by)
from public.matches match_row
where match_row.id = event_row.match_id
  and (event_row.team_id is null or event_row.created_by is null);

create or replace function private.assign_match_event_team_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team_id uuid;
begin
  select match.team_id into v_team_id
  from public.matches match
  where match.id = new.match_id;
  if v_team_id is null then
    raise exception 'Match event references a missing match' using errcode = '23503';
  end if;
  if new.team_id is not null and new.team_id <> v_team_id then
    raise exception 'Match event team does not match its match' using errcode = '23503';
  end if;
  new.team_id := v_team_id;
  return new;
end;
$$;

drop trigger if exists match_event_assign_team on public.match_events;
create trigger match_event_assign_team
  before insert or update of match_id, team_id on public.match_events
  for each row execute function private.assign_match_event_team_id();

alter table public.match_events alter column team_id set not null;
create index if not exists match_events_team_id_idx on public.match_events(team_id);
create index if not exists match_events_created_by_idx on public.match_events(created_by);

create or replace function private.set_membership_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists team_membership_set_updated_at on public.team_memberships;
create trigger team_membership_set_updated_at
  before update on public.team_memberships
  for each row execute function private.set_membership_updated_at();

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
revoke all on function private.set_profile_updated_at() from public, anon, authenticated;
revoke all on function private.assign_match_event_team_id() from public, anon, authenticated;
revoke all on function private.set_membership_updated_at() from public, anon, authenticated;

commit;
