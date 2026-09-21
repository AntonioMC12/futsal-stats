-- A finished match can be verified by another device only if the expected IDs
-- were durably published by the capturing device. Do not backfill from cloud:
-- an incomplete cloud match would otherwise become falsely verified.
create table if not exists public.match_integrity_manifests (
  match_id uuid primary key references public.matches(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete restrict,
  expected_event_ids jsonb not null check (jsonb_typeof(expected_event_ids) = 'array'),
  expected_lineup_event_ids jsonb not null check (jsonb_typeof(expected_lineup_event_ids) = 'array'),
  expected_player_ids jsonb not null check (jsonb_typeof(expected_player_ids) = 'array'),
  checksum text not null,
  published_at timestamptz not null default now()
);

create index if not exists match_integrity_manifests_team_id_idx
  on public.match_integrity_manifests(team_id);
alter table public.match_integrity_manifests enable row level security;
revoke all on public.match_integrity_manifests from anon, authenticated;
grant select on public.match_integrity_manifests to authenticated;
create policy match_integrity_manifests_read on public.match_integrity_manifests
  for select to authenticated using (private.can_access_team(team_id));

create or replace function public.publish_match_integrity_manifest(
  p_match_id uuid,
  p_event_ids jsonb,
  p_lineup_event_ids jsonb,
  p_player_ids jsonb,
  p_checksum text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team_id uuid;
begin
  select team_id into v_team_id from public.matches
    where id = p_match_id and status = 'finished' and deleted_at is null;
  if v_team_id is null then
    raise exception 'Finished match not found' using errcode = '23503';
  end if;
  if not private.can_access_team(v_team_id, true) then
    raise exception 'Team access denied' using errcode = '42501';
  end if;
  if jsonb_typeof(p_event_ids) <> 'array'
    or jsonb_typeof(p_lineup_event_ids) <> 'array'
    or jsonb_typeof(p_player_ids) <> 'array' then
    raise exception 'Invalid integrity manifest' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.match_integrity_manifests old_manifest,
      jsonb_array_elements_text(old_manifest.expected_event_ids) old_id
    where old_manifest.match_id = p_match_id and not (p_event_ids ? old_id.value)
  ) then
    raise exception 'Integrity manifest cannot remove expected events' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.match_integrity_manifests old_manifest,
      jsonb_array_elements_text(old_manifest.expected_lineup_event_ids) old_id
    where old_manifest.match_id = p_match_id and not (p_lineup_event_ids ? old_id.value)
  ) then
    raise exception 'Integrity manifest cannot remove expected lineups' using errcode = '22023';
  end if;
  insert into public.match_integrity_manifests
    (match_id, team_id, expected_event_ids, expected_lineup_event_ids, expected_player_ids, checksum)
  values (p_match_id, v_team_id, p_event_ids, p_lineup_event_ids, p_player_ids, p_checksum)
  on conflict (match_id) do update set
    expected_event_ids = excluded.expected_event_ids,
    expected_lineup_event_ids = excluded.expected_lineup_event_ids,
    expected_player_ids = excluded.expected_player_ids,
    checksum = excluded.checksum,
    published_at = now()
  where public.match_integrity_manifests.team_id = v_team_id;
end;
$$;

revoke all on function public.publish_match_integrity_manifest(uuid, jsonb, jsonb, jsonb, text) from public, anon;
grant execute on function public.publish_match_integrity_manifest(uuid, jsonb, jsonb, jsonb, text) to authenticated;
