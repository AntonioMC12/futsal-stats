begin;

alter table public.matches add column if not exists source text not null default 'native'
  check (source in ('native', 'csv-import'));
alter table public.matches add column if not exists import_metadata jsonb;

create unique index if not exists matches_team_import_fingerprint_idx
  on public.matches(team_id, (import_metadata->>'fingerprint'))
  where deleted_at is null and source = 'csv-import' and import_metadata->>'fingerprint' is not null;

create or replace function public.import_match_from_csv(p_players jsonb, p_match jsonb, p_events jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player jsonb;
  v_match_id uuid := (p_match->>'id')::uuid;
  v_team_id uuid := (p_match->>'team_id')::uuid;
begin
  if not private.can_access_team(v_team_id, true) then
    raise exception 'Team access denied' using errcode = '42501';
  end if;
  if coalesce(p_match->>'source', '') <> 'csv-import' then
    raise exception 'Invalid import source' using errcode = '22023';
  end if;
  for v_player in select value from jsonb_array_elements(coalesce(p_players, '[]'::jsonb)) loop
    if (v_player->>'team_id')::uuid <> v_team_id then
      raise exception 'Player belongs to another team' using errcode = '23503';
    end if;
    perform public.upsert_player(v_player);
  end loop;
  perform public.commit_match_events(p_match, p_events);
  update public.matches
  set source = 'csv-import', import_metadata = p_match->'import_metadata'
  where id = v_match_id and team_id = v_team_id;
end;
$$;

revoke all on function public.import_match_from_csv(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.import_match_from_csv(jsonb, jsonb, jsonb) to authenticated;

commit;
