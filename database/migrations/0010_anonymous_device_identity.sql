begin;

create table public.team_recovery_credentials (
  team_id uuid primary key references public.teams(id) on delete cascade,
  token_hash bytea not null unique,
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  last_used_at timestamptz
);

create table public.team_recovery_attempts (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0
);

alter table public.team_recovery_credentials enable row level security;
alter table public.team_recovery_attempts enable row level security;
revoke all on public.team_recovery_credentials, public.team_recovery_attempts from public, anon, authenticated;

alter table public.team_access_audit drop constraint team_access_audit_action_check;
alter table public.team_access_audit add constraint team_access_audit_action_check
  check (action in ('invite_created', 'invite_consumed', 'member_updated', 'member_revoked',
    'recovery_created', 'recovery_rotated', 'recovery_used'));

create or replace function public.create_team_with_recovery_key(p_team jsonb)
returns table(team_id uuid, recovery_key text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_team_id uuid := (p_team->>'id')::uuid;
  v_key text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if v_team_id is null or exists (select 1 from public.teams where id = v_team_id) then
    raise exception 'Team already exists or has invalid id' using errcode = '22023';
  end if;
  insert into public.teams(id, seed_key, name, short_name, logo, created_at, updated_at, created_by)
  values (v_team_id, nullif(p_team->>'seed_key', ''), p_team->>'name', p_team->>'short_name',
    nullif(p_team->>'logo', ''), (p_team->>'created_at')::timestamptz,
    (p_team->>'updated_at')::timestamptz, v_user_id);
  insert into public.team_memberships(team_id, auth_user_id, role)
  values (v_team_id, v_user_id, 'owner');
  insert into public.team_recovery_credentials(team_id, token_hash)
  values (v_team_id, extensions.digest(v_key, 'sha256'));
  insert into public.team_access_audit(team_id, actor_user_id, action)
  values (v_team_id, v_user_id, 'recovery_created');
  return query select v_team_id, v_key;
end;
$$;

create or replace function public.rotate_team_recovery_key(p_team_id uuid)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_key text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if v_user_id is null or not private.is_team_owner(p_team_id) then
    raise exception 'Only an owner can rotate recovery access' using errcode = '42501';
  end if;
  perform 1 from public.teams where id = p_team_id for update;
  if not private.is_team_owner(p_team_id) then
    raise exception 'Only an owner can rotate recovery access' using errcode = '42501';
  end if;
  insert into public.team_recovery_credentials(team_id, token_hash, rotated_at)
  values (p_team_id, extensions.digest(v_key, 'sha256'), now())
  on conflict (team_id) do update set token_hash = excluded.token_hash,
    rotated_at = now(), last_used_at = null;
  insert into public.team_access_audit(team_id, actor_user_id, action)
  values (p_team_id, v_user_id, 'recovery_rotated');
  return v_key;
end;
$$;

create or replace function public.has_team_recovery_key(p_team_id uuid)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not private.is_team_owner(p_team_id) then
    raise exception 'Only an owner can inspect recovery access' using errcode = '42501';
  end if;
  return exists (select 1 from public.team_recovery_credentials where team_id = p_team_id);
end;
$$;

create or replace function public.recover_team_access(p_recovery_key text, p_device_name text default null)
returns table(team_id uuid, team_name text, role text)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_key text := regexp_replace(lower(regexp_replace(trim(coalesce(p_recovery_key, '')), '^FS-', '', 'i')),
    '[^0-9a-f]', '', 'g');
  v_team_id uuid;
  v_team_name text;
  v_attempts integer;
  v_device_name text := nullif(left(trim(coalesce(p_device_name, '')), 80), '');
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;

  insert into public.team_recovery_attempts(auth_user_id, window_started_at, attempts)
  values (v_user_id, now(), 1)
  on conflict (auth_user_id) do update set
    window_started_at = case when public.team_recovery_attempts.window_started_at < now() - interval '15 minutes'
      then now() else public.team_recovery_attempts.window_started_at end,
    attempts = case when public.team_recovery_attempts.window_started_at < now() - interval '15 minutes'
      then 1 else public.team_recovery_attempts.attempts + 1 end
  returning attempts into v_attempts;
  if v_attempts > 5 or length(v_key) <> 64 then return; end if;

  select credentials.team_id into v_team_id
  from public.team_recovery_credentials credentials
  where credentials.token_hash = extensions.digest(v_key, 'sha256')
  for update;
  if not found then return; end if;

  select teams.name into v_team_name from public.teams teams
  where teams.id = v_team_id and teams.deleted_at is null;
  if not found then return; end if;

  insert into public.team_memberships(team_id, auth_user_id, role, device_name)
  values (v_team_id, v_user_id, 'owner', v_device_name)
  on conflict (team_id, auth_user_id) do update set role = 'owner',
    device_name = coalesce(excluded.device_name, public.team_memberships.device_name);
  update public.team_recovery_credentials set last_used_at = now() where team_id = v_team_id;
  update public.team_recovery_attempts set attempts = 0 where auth_user_id = v_user_id;
  insert into public.team_access_audit(team_id, actor_user_id, target_user_id, action, details)
  values (v_team_id, v_user_id, v_user_id, 'recovery_used',
    jsonb_build_object('device_name', v_device_name));
  return query select v_team_id, v_team_name, 'owner'::text;
end;
$$;

revoke all on function public.create_team_with_recovery_key(jsonb),
  public.rotate_team_recovery_key(uuid), public.has_team_recovery_key(uuid),
  public.recover_team_access(text, text) from public, anon, authenticated;
grant execute on function public.create_team_with_recovery_key(jsonb),
  public.rotate_team_recovery_key(uuid), public.has_team_recovery_key(uuid),
  public.recover_team_access(text, text) to authenticated;

commit;
