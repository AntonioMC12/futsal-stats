begin;

alter table public.matches add column if not exists description text not null default '';

create table public.team_memberships (
  team_id uuid not null references public.teams(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'editor', 'viewer')),
  device_name text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (team_id, auth_user_id)
);

create index team_memberships_auth_user_id_idx on public.team_memberships(auth_user_id);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.can_access_team(p_team_id uuid, p_write boolean default false)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_memberships membership
    where membership.team_id = p_team_id
      and membership.auth_user_id = auth.uid()
      and (not p_write or membership.role in ('owner', 'editor'))
  );
$$;

revoke all on function private.can_access_team(uuid, boolean) from public;
grant execute on function private.can_access_team(uuid, boolean) to authenticated;

create or replace function private.is_team_owner(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_memberships membership
    where membership.team_id = p_team_id and membership.auth_user_id = auth.uid()
      and membership.role = 'owner'
  );
$$;
revoke all on function private.is_team_owner(uuid) from public;
grant execute on function private.is_team_owner(uuid) to authenticated;

alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.match_events enable row level security;
alter table public.match_event_lineup_players enable row level security;
alter table public.team_memberships enable row level security;

revoke all on table public.teams, public.players, public.matches, public.match_players,
  public.match_events, public.match_event_lineup_players, public.team_memberships from anon;
revoke all on table public.teams, public.players, public.matches, public.match_players,
  public.match_events, public.match_event_lineup_players, public.team_memberships from authenticated;

grant select on public.teams, public.players, public.matches, public.match_players,
  public.match_events, public.match_event_lineup_players, public.team_memberships to authenticated;
grant insert, update on public.teams, public.players, public.matches, public.match_players,
  public.match_events, public.match_event_lineup_players to authenticated;
grant update on public.team_memberships to authenticated;

create policy teams_read on public.teams for select to authenticated
  using (private.can_access_team(id));
create policy teams_write on public.teams for update to authenticated
  using (private.can_access_team(id, true)) with check (private.can_access_team(id, true));

create policy players_read on public.players for select to authenticated
  using (private.can_access_team(team_id));
create policy players_insert on public.players for insert to authenticated
  with check (private.can_access_team(team_id, true));
create policy players_update on public.players for update to authenticated
  using (private.can_access_team(team_id, true)) with check (private.can_access_team(team_id, true));

create policy matches_read on public.matches for select to authenticated
  using (private.can_access_team(team_id));
create policy matches_insert on public.matches for insert to authenticated
  with check (private.can_access_team(team_id, true));
create policy matches_update on public.matches for update to authenticated
  using (private.can_access_team(team_id, true)) with check (private.can_access_team(team_id, true));

create policy match_players_read on public.match_players for select to authenticated using (
  exists (select 1 from public.matches m where m.id = match_id and private.can_access_team(m.team_id))
);
create policy match_players_insert on public.match_players for insert to authenticated with check (
  exists (select 1 from public.matches m where m.id = match_id and private.can_access_team(m.team_id, true))
);
create policy match_players_update on public.match_players for update to authenticated using (
  exists (select 1 from public.matches m where m.id = match_id and private.can_access_team(m.team_id, true))
) with check (
  exists (select 1 from public.matches m where m.id = match_id and private.can_access_team(m.team_id, true))
);

create policy match_events_read on public.match_events for select to authenticated using (
  exists (select 1 from public.matches m where m.id = match_id and private.can_access_team(m.team_id))
);
create policy match_events_insert on public.match_events for insert to authenticated with check (
  exists (select 1 from public.matches m where m.id = match_id and private.can_access_team(m.team_id, true))
);
create policy match_events_update on public.match_events for update to authenticated using (
  exists (select 1 from public.matches m where m.id = match_id and private.can_access_team(m.team_id, true))
) with check (
  exists (select 1 from public.matches m where m.id = match_id and private.can_access_team(m.team_id, true))
);

create policy lineup_read on public.match_event_lineup_players for select to authenticated using (
  exists (
    select 1 from public.match_events e join public.matches m on m.id = e.match_id
    where e.id = event_id and private.can_access_team(m.team_id)
  )
);
create policy lineup_insert on public.match_event_lineup_players for insert to authenticated with check (
  exists (
    select 1 from public.match_events e join public.matches m on m.id = e.match_id
    where e.id = event_id and private.can_access_team(m.team_id, true)
  )
);

create policy memberships_read on public.team_memberships for select to authenticated
  using (private.can_access_team(team_id));
create policy memberships_update on public.team_memberships for update to authenticated
  using (private.is_team_owner(team_id)) with check (private.is_team_owner(team_id));

create or replace function public.upsert_team_workspace(p_team jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_team_id uuid := (p_team->>'id')::uuid;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if exists (select 1 from public.teams where id = v_team_id) and not private.can_access_team(v_team_id, true) then
    raise exception 'Team access denied' using errcode = '42501';
  end if;

  insert into public.teams (id, seed_key, name, short_name, logo, created_at, updated_at)
  values (v_team_id, nullif(p_team->>'seed_key', ''), p_team->>'name', p_team->>'short_name',
    nullif(p_team->>'logo', ''), (p_team->>'created_at')::timestamptz, (p_team->>'updated_at')::timestamptz)
  on conflict (id) do update set name = excluded.name, short_name = excluded.short_name,
    logo = excluded.logo, updated_at = excluded.updated_at, revision = public.teams.revision + 1;

  insert into public.team_memberships (team_id, auth_user_id, role)
  values (v_team_id, v_user_id, 'owner') on conflict do nothing;
  return v_team_id;
end;
$$;

create or replace function public.upsert_player(p_player jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := (p_player->>'id')::uuid;
  v_team_id uuid := (p_player->>'team_id')::uuid;
begin
  if not private.can_access_team(v_team_id, true) then raise exception 'Team access denied' using errcode = '42501'; end if;
  if exists (select 1 from public.players where id = v_id and team_id <> v_team_id) then
    raise exception 'Player id belongs to another team' using errcode = '42501';
  end if;
  insert into public.players (id, team_id, number, name, position, active, created_at, updated_at)
  values (v_id, v_team_id, (p_player->>'number')::smallint, p_player->>'name', nullif(p_player->>'position', ''),
    coalesce((p_player->>'active')::boolean, true), now(), now())
  on conflict (id) do update set number = excluded.number, name = excluded.name, position = excluded.position,
    active = excluded.active, updated_at = now(), revision = public.players.revision + 1
  where public.players.team_id = v_team_id;
  return v_id;
end;
$$;

create or replace function public.upsert_match_snapshot(p_match jsonb, p_only_if_no_active boolean default false)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := (p_match->>'id')::uuid;
  v_team_id uuid := (p_match->>'team_id')::uuid;
  v_player_id text;
begin
  if not private.can_access_team(v_team_id, true) then raise exception 'Team access denied' using errcode = '42501'; end if;
  if exists (select 1 from public.matches where id = v_id and team_id <> v_team_id) then
    raise exception 'Match id belongs to another team' using errcode = '42501';
  end if;
  if p_only_if_no_active and exists (
    select 1 from public.matches where team_id = v_team_id and deleted_at is null
      and status in ('ready', 'firstHalf', 'halftime', 'secondHalf') and id <> v_id
  ) then return false; end if;

  insert into public.matches (id, team_id, home_team_name, home_team_short_name, opponent_name,
    opponent_short_name, match_date, description, status, current_period, period_count, clock, created_at, updated_at)
  values (v_id, v_team_id, p_match->>'home_team_name', p_match->>'home_team_short_name', p_match->>'opponent_name',
    p_match->>'opponent_short_name', (p_match->>'match_date')::timestamptz, coalesce(p_match->>'description', ''),
    p_match->>'status', (p_match->>'current_period')::smallint, (p_match->>'period_count')::smallint,
    p_match->'clock', (p_match->>'created_at')::timestamptz, (p_match->>'updated_at')::timestamptz)
  on conflict (id) do update set home_team_name = excluded.home_team_name,
    home_team_short_name = excluded.home_team_short_name, opponent_name = excluded.opponent_name,
    opponent_short_name = excluded.opponent_short_name, match_date = excluded.match_date,
    description = excluded.description, status = excluded.status, current_period = excluded.current_period,
    period_count = excluded.period_count, clock = excluded.clock, updated_at = excluded.updated_at,
    revision = public.matches.revision + 1 where public.matches.team_id = v_team_id;

  delete from public.match_players where match_id = v_id;
  for v_player_id in select jsonb_array_elements_text(coalesce(p_match->'squad_player_ids', '[]'::jsonb)) loop
    if not exists (select 1 from public.players where id = v_player_id::uuid and team_id = v_team_id) then
      raise exception 'Player does not belong to team' using errcode = '23503';
    end if;
    insert into public.match_players (match_id, player_id, in_squad, is_starter)
    values (v_id, v_player_id::uuid, true, (p_match->'starting_lineup_player_ids') ? v_player_id);
  end loop;
  return true;
end;
$$;

create or replace function public.commit_match_events(p_match jsonb, p_events jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event jsonb;
  v_lineup_id text;
begin
  perform public.upsert_match_snapshot(p_match, false);
  set constraints all deferred;
  for v_event in select value from jsonb_array_elements(coalesce(p_events, '[]'::jsonb)) loop
    if (v_event->>'match_id')::uuid <> (p_match->>'id')::uuid then
      raise exception 'Event belongs to another match' using errcode = '23503';
    end if;
    if exists (
      select 1 from public.match_events
      where id = (v_event->>'id')::uuid and match_id <> (p_match->>'id')::uuid
    ) then raise exception 'Event id belongs to another match' using errcode = '42501'; end if;
    insert into public.match_events (id, match_id, player_id, out_player_id, in_player_id, target_event_id,
      reduction_event_id, event_type, period, game_clock_ms, sequence, occurred_at, undone, metadata, created_at, updated_at)
    values ((v_event->>'id')::uuid, (v_event->>'match_id')::uuid, nullif(v_event->>'player_id', '')::uuid,
      nullif(v_event->>'out_player_id', '')::uuid, nullif(v_event->>'in_player_id', '')::uuid,
      nullif(v_event->>'target_event_id', '')::uuid, nullif(v_event->>'reduction_event_id', '')::uuid,
      v_event->>'event_type', (v_event->>'period')::smallint, (v_event->>'game_clock_ms')::integer,
      (v_event->>'sequence')::integer, (v_event->>'occurred_at')::timestamptz,
      coalesce((v_event->>'undone')::boolean, false), coalesce(v_event->'metadata', '{}'::jsonb), now(), now())
    on conflict (id) do nothing;
    for v_lineup_id in select jsonb_array_elements_text(coalesce(v_event->'lineup_player_ids', '[]'::jsonb)) loop
      insert into public.match_event_lineup_players (event_id, player_id, position)
      values ((v_event->>'id')::uuid, v_lineup_id::uuid,
        array_position(array(select jsonb_array_elements_text(v_event->'lineup_player_ids')), v_lineup_id) - 1)
      on conflict do nothing;
    end loop;
  end loop;
end;
$$;

create or replace function public.delete_match_workspace(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_team_id uuid;
begin
  select team_id into v_team_id from public.matches where id = p_match_id;
  if v_team_id is null or not private.can_access_team(v_team_id, true) then
    raise exception 'Match access denied' using errcode = '42501';
  end if;
  delete from public.matches where id = p_match_id;
end;
$$;

revoke all on function public.upsert_team_workspace(jsonb), public.upsert_player(jsonb),
  public.upsert_match_snapshot(jsonb, boolean), public.commit_match_events(jsonb, jsonb),
  public.delete_match_workspace(uuid) from public, anon;
grant execute on function public.upsert_team_workspace(jsonb), public.upsert_player(jsonb),
  public.upsert_match_snapshot(jsonb, boolean), public.commit_match_events(jsonb, jsonb),
  public.delete_match_workspace(uuid) to authenticated;

commit;
