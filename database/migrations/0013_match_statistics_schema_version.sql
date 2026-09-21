begin;

-- Null is deliberate: pre-iteration matches did not record these metrics.
alter table public.matches add column if not exists statistics_schema_version smallint
  check (statistics_schema_version is null or statistics_schema_version = 2);

alter function public.upsert_match_snapshot(jsonb, boolean)
  rename to upsert_match_snapshot_before_statistics_v2;
revoke all on function public.upsert_match_snapshot_before_statistics_v2(jsonb, boolean)
  from public, anon, authenticated;

create function public.upsert_match_snapshot(p_match jsonb, p_only_if_no_active boolean default false)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_saved boolean;
begin
  if p_match->>'statistics_schema_version' is not null
    and p_match->>'statistics_schema_version' <> '2' then
    raise exception 'Unsupported statistics schema version' using errcode = '22023';
  end if;
  v_saved := public.upsert_match_snapshot_before_statistics_v2(p_match, p_only_if_no_active);
  if v_saved then
    update public.matches set statistics_schema_version =
      coalesce(statistics_schema_version, (p_match->>'statistics_schema_version')::smallint)
    where id = (p_match->>'id')::uuid and team_id = (p_match->>'team_id')::uuid;
  end if;
  return v_saved;
end;
$$;

revoke all on function public.upsert_match_snapshot(jsonb, boolean) from public, anon;
grant execute on function public.upsert_match_snapshot(jsonb, boolean) to authenticated;

commit;
