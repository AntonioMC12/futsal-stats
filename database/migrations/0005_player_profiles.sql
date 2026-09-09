begin;

create table public.player_profiles (
  player_id uuid primary key references public.players(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete restrict,
  photo_url text,
  preferred_foot text not null default 'unknown'
    check (preferred_foot in ('unknown', 'right', 'left', 'both')),
  notes text not null default '' check (length(notes) <= 2000),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  revision bigint not null default 1 check (revision > 0)
);

create index player_profiles_team_id_idx on public.player_profiles(team_id);

alter table public.player_profiles enable row level security;
revoke all on table public.player_profiles from public, anon, authenticated;
grant select on table public.player_profiles to authenticated;

create policy player_profiles_read on public.player_profiles for select to authenticated
  using (private.can_access_team(team_id));
create policy player_profiles_insert on public.player_profiles for insert to authenticated
  with check (private.can_access_team(team_id, true));
create policy player_profiles_update on public.player_profiles for update to authenticated
  using (private.can_access_team(team_id, true))
  with check (private.can_access_team(team_id, true));

create or replace function public.upsert_player_profile(p_profile jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_id uuid := (p_profile->>'player_id')::uuid;
  v_team_id uuid := (p_profile->>'team_id')::uuid;
begin
  if not private.can_access_team(v_team_id, true) then
    raise exception 'Team access denied' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.players
    where id = v_player_id and team_id = v_team_id and deleted_at is null
  ) then
    raise exception 'Player does not belong to team' using errcode = '23503';
  end if;

  insert into public.player_profiles (
    player_id, team_id, photo_url, preferred_foot, notes, metadata, created_at, updated_at
  ) values (
    v_player_id,
    v_team_id,
    nullif(btrim(p_profile->>'photo_url'), ''),
    coalesce(nullif(p_profile->>'preferred_foot', ''), 'unknown'),
    left(coalesce(p_profile->>'notes', ''), 2000),
    coalesce(p_profile->'metadata', '{}'::jsonb),
    (p_profile->>'created_at')::timestamptz,
    (p_profile->>'updated_at')::timestamptz
  )
  on conflict (player_id) do update set
    photo_url = excluded.photo_url,
    preferred_foot = excluded.preferred_foot,
    notes = excluded.notes,
    metadata = excluded.metadata,
    updated_at = excluded.updated_at,
    deleted_at = null,
    revision = public.player_profiles.revision + 1
  where public.player_profiles.team_id = v_team_id;

  return v_player_id;
end;
$$;

revoke all on function public.upsert_player_profile(jsonb) from public, anon;
grant execute on function public.upsert_player_profile(jsonb) to authenticated;

commit;
