begin;

alter table public.matches add column if not exists season text;
alter table public.matches add column if not exists competition text;

update public.matches
set season = case
  when extract(month from match_date) >= 7
    then extract(year from match_date)::integer || '/' || right((extract(year from match_date)::integer + 1)::text, 2)
  else (extract(year from match_date)::integer - 1) || '/' || right(extract(year from match_date)::integer::text, 2)
end
where season is null or btrim(season) = '';

update public.matches
set competition = 'Sin competición'
where competition is null or btrim(competition) = '';

alter table public.matches alter column season set not null;
alter table public.matches alter column competition set not null;
alter table public.matches alter column season set default 'Sin temporada';
alter table public.matches alter column competition set default 'Sin competición';

create index if not exists matches_team_season_date_idx
  on public.matches(team_id, season, match_date desc)
  where deleted_at is null;
create index if not exists matches_team_competition_idx
  on public.matches(team_id, competition)
  where deleted_at is null;

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
  v_match_date timestamptz := (p_match->>'match_date')::timestamptz;
  v_season text;
begin
  if not private.can_access_team(v_team_id, true) then raise exception 'Team access denied' using errcode = '42501'; end if;
  if exists (select 1 from public.matches where id = v_id and team_id <> v_team_id) then
    raise exception 'Match id belongs to another team' using errcode = '42501';
  end if;
  if p_only_if_no_active and exists (
    select 1 from public.matches where team_id = v_team_id and deleted_at is null
      and status in ('ready', 'firstHalf', 'halftime', 'secondHalf') and id <> v_id
  ) then return false; end if;

  v_season := coalesce(nullif(btrim(p_match->>'season'), ''),
    case when extract(month from v_match_date) >= 7
      then extract(year from v_match_date)::integer || '/' || right((extract(year from v_match_date)::integer + 1)::text, 2)
      else (extract(year from v_match_date)::integer - 1) || '/' || right(extract(year from v_match_date)::integer::text, 2)
    end);

  insert into public.matches (id, team_id, home_team_name, home_team_short_name, opponent_name,
    opponent_short_name, match_date, season, competition, description, status, current_period,
    period_count, clock, created_at, updated_at)
  values (v_id, v_team_id, p_match->>'home_team_name', p_match->>'home_team_short_name', p_match->>'opponent_name',
    p_match->>'opponent_short_name', v_match_date, v_season,
    coalesce(nullif(btrim(p_match->>'competition'), ''), 'Sin competición'),
    coalesce(p_match->>'description', ''), p_match->>'status', (p_match->>'current_period')::smallint,
    (p_match->>'period_count')::smallint, p_match->'clock', (p_match->>'created_at')::timestamptz,
    (p_match->>'updated_at')::timestamptz)
  on conflict (id) do update set home_team_name = excluded.home_team_name,
    home_team_short_name = excluded.home_team_short_name, opponent_name = excluded.opponent_name,
    opponent_short_name = excluded.opponent_short_name, match_date = excluded.match_date,
    season = excluded.season, competition = excluded.competition, description = excluded.description,
    status = excluded.status, current_period = excluded.current_period,
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

revoke all on function public.upsert_match_snapshot(jsonb, boolean) from public, anon;
grant execute on function public.upsert_match_snapshot(jsonb, boolean) to authenticated;

commit;
