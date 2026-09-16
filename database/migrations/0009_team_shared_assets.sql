begin;

create table public.strategies (
  id uuid primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  variant text,
  description text not null default '',
  category text not null default '',
  season text,
  phases jsonb not null default '[]'::jsonb check (jsonb_typeof(phases) = 'array'),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz
);
create index strategies_team_id_idx on public.strategies(team_id);
alter table public.strategies enable row level security;
revoke all on table public.strategies from public, anon, authenticated;
grant select on table public.strategies to authenticated;
create policy strategies_read on public.strategies for select to authenticated
  using (private.can_access_team(team_id));

create or replace function public.upsert_team_strategy(p_strategy jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := (p_strategy->>'id')::uuid;
  v_team_id uuid := (p_strategy->>'team_id')::uuid;
  v_saved uuid;
begin
  if not private.can_access_team(v_team_id, true) then
    raise exception 'Team access denied' using errcode = '42501';
  end if;
  insert into public.strategies (
    id, team_id, name, variant, description, category, season, phases, created_at, updated_at
  ) values (
    v_id, v_team_id, left(p_strategy->>'name', 80), p_strategy->>'variant',
    coalesce(p_strategy->>'description', ''), coalesce(p_strategy->>'category', ''),
    p_strategy->>'season', coalesce(p_strategy->'phases', '[]'::jsonb),
    (p_strategy->>'created_at')::timestamptz, (p_strategy->>'updated_at')::timestamptz
  )
  on conflict (id) do update set
    name = excluded.name, variant = excluded.variant, description = excluded.description,
    category = excluded.category, season = excluded.season, phases = excluded.phases,
    updated_at = excluded.updated_at
  where public.strategies.team_id = v_team_id
    and public.strategies.deleted_at is null
    and public.strategies.updated_at <= excluded.updated_at
  returning id into v_saved;
  if v_saved is null then
    raise exception 'Strategy changed or deleted remotely' using errcode = '23505';
  end if;
  return v_saved;
end;
$$;
revoke all on function public.upsert_team_strategy(jsonb) from public, anon;
grant execute on function public.upsert_team_strategy(jsonb) to authenticated;

create or replace function public.delete_team_strategy(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team_id uuid;
begin
  select team_id into v_team_id from public.strategies where id = p_id;
  if v_team_id is null then return; end if;
  if not private.can_access_team(v_team_id, true) then
    raise exception 'Team access denied' using errcode = '42501';
  end if;
  update public.strategies set deleted_at = coalesce(deleted_at, now()), updated_at = now()
  where id = p_id and deleted_at is null;
end;
$$;
revoke all on function public.delete_team_strategy(uuid) from public, anon;
grant execute on function public.delete_team_strategy(uuid) to authenticated;

insert into storage.buckets (id, name, public)
values ('player-photos', 'player-photos', false)
on conflict (id) do update set public = false;

create policy player_photos_read on storage.objects for select to authenticated
  using (
    bucket_id = 'player-photos'
    and split_part(name, '/', 1) = 'teams'
    and private.can_access_team((split_part(name, '/', 2))::uuid)
  );
create policy player_photos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'player-photos'
    and split_part(name, '/', 1) = 'teams'
    and split_part(name, '/', 3) = 'players'
    and split_part(name, '/', 5) = 'profile'
    and private.can_access_team((split_part(name, '/', 2))::uuid, true)
    and exists (
      select 1 from public.players p
      where p.id = (split_part(name, '/', 4))::uuid
        and p.team_id = (split_part(name, '/', 2))::uuid
        and p.deleted_at is null
    )
  );
create policy player_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'player-photos' and private.can_access_team((split_part(name, '/', 2))::uuid, true))
  with check (
    bucket_id = 'player-photos'
    and split_part(name, '/', 1) = 'teams'
    and split_part(name, '/', 3) = 'players'
    and split_part(name, '/', 5) = 'profile'
    and private.can_access_team((split_part(name, '/', 2))::uuid, true)
    and exists (
      select 1 from public.players p
      where p.id = (split_part(name, '/', 4))::uuid
        and p.team_id = (split_part(name, '/', 2))::uuid
        and p.deleted_at is null
    )
  );
create policy player_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'player-photos' and private.can_access_team((split_part(name, '/', 2))::uuid, true));

commit;
