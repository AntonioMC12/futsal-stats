begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  token_hash bytea not null unique,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  check (expires_at > created_at)
);

create index team_invites_team_id_idx on public.team_invites(team_id);
create index team_invites_expires_at_idx on public.team_invites(expires_at)
  where used_at is null and revoked_at is null;

create table public.team_access_audit (
  id bigint generated always as identity primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('invite_created', 'invite_consumed', 'member_updated', 'member_revoked')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index team_access_audit_team_created_idx
  on public.team_access_audit(team_id, created_at desc);

alter table public.team_invites enable row level security;
alter table public.team_access_audit enable row level security;

revoke all on table public.team_invites, public.team_access_audit from public, anon, authenticated;
revoke update, select on table public.team_memberships from authenticated;

create or replace function public.create_team_invite(
  p_team_id uuid,
  p_role text,
  p_ttl_minutes integer default 15
)
returns table(invite_id uuid, token text, expires_at timestamptz, role text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_token text := encode(extensions.gen_random_bytes(18), 'hex');
  v_invite_id uuid;
  v_expires_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if not private.is_team_owner(p_team_id) then
    raise exception 'Only an owner can create invitations' using errcode = '42501';
  end if;
  perform 1 from public.teams where id = p_team_id for update;
  if not private.is_team_owner(p_team_id) then
    raise exception 'Only an owner can create invitations' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('owner', 'editor', 'viewer') then
    raise exception 'Invalid membership role' using errcode = '22023';
  end if;
  if p_ttl_minutes is null or p_ttl_minutes < 5 or p_ttl_minutes > 60 then
    raise exception 'Invitation lifetime must be between 5 and 60 minutes' using errcode = '22023';
  end if;

  v_expires_at := now() + make_interval(mins => p_ttl_minutes);
  insert into public.team_invites (team_id, token_hash, role, created_by, expires_at)
  values (p_team_id, extensions.digest(v_token, 'sha256'), p_role, v_user_id, v_expires_at)
  returning id into v_invite_id;

  insert into public.team_access_audit (team_id, actor_user_id, action, details)
  values (p_team_id, v_user_id, 'invite_created', jsonb_build_object(
    'invite_id', v_invite_id, 'role', p_role, 'expires_at', v_expires_at
  ));

  return query select v_invite_id, v_token, v_expires_at, p_role;
end;
$$;

create or replace function public.consume_team_invite(p_token text, p_device_name text default null)
returns table(team_id uuid, team_name text, role text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_normalized_token text := regexp_replace(lower(coalesce(p_token, '')), '[^0-9a-f]', '', 'g');
  v_invite public.team_invites%rowtype;
  v_team_name text;
  v_device_name text := nullif(left(trim(coalesce(p_device_name, '')), 80), '');
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if length(v_normalized_token) <> 36 then
    raise exception 'Invitation is invalid, expired or already used' using errcode = 'P0001';
  end if;

  select * into v_invite
  from public.team_invites invitation
  where invitation.token_hash = extensions.digest(v_normalized_token, 'sha256')
  for update;

  if not found or v_invite.used_at is not null or v_invite.revoked_at is not null
    or v_invite.expires_at <= now() then
    raise exception 'Invitation is invalid, expired or already used' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.team_memberships membership
    where membership.team_id = v_invite.team_id and membership.auth_user_id = v_user_id
  ) then
    raise exception 'This device already belongs to the team' using errcode = 'P0001';
  end if;

  insert into public.team_memberships (team_id, auth_user_id, role, device_name)
  values (v_invite.team_id, v_user_id, v_invite.role, v_device_name);

  update public.team_invites
  set used_at = now(), used_by = v_user_id
  where id = v_invite.id;

  insert into public.team_access_audit (team_id, actor_user_id, target_user_id, action, details)
  values (v_invite.team_id, v_user_id, v_user_id, 'invite_consumed', jsonb_build_object(
    'invite_id', v_invite.id, 'role', v_invite.role, 'device_name', v_device_name
  ));

  select name into v_team_name from public.teams where id = v_invite.team_id;
  return query select v_invite.team_id, v_team_name, v_invite.role;
end;
$$;

create or replace function public.list_team_devices(p_team_id uuid)
returns table(
  auth_user_id uuid,
  role text,
  device_name text,
  created_at timestamptz,
  last_seen_at timestamptz,
  is_current boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare v_user_id uuid := auth.uid();
begin
  if v_user_id is null or not private.is_team_owner(p_team_id) then
    raise exception 'Only an owner can manage devices' using errcode = '42501';
  end if;
  update public.team_memberships membership
  set last_seen_at = now()
  where membership.team_id = p_team_id and membership.auth_user_id = v_user_id;
  return query
    select membership.auth_user_id, membership.role, membership.device_name,
      membership.created_at, membership.last_seen_at, membership.auth_user_id = v_user_id
    from public.team_memberships membership
    where membership.team_id = p_team_id
    order by membership.created_at;
end;
$$;

create or replace function public.touch_device_memberships()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.team_memberships membership
  set last_seen_at = now()
  where membership.auth_user_id = auth.uid();
$$;

create or replace function public.update_team_device(
  p_team_id uuid,
  p_auth_user_id uuid,
  p_role text,
  p_device_name text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_previous_role text;
  v_device_name text := nullif(left(trim(coalesce(p_device_name, '')), 80), '');
begin
  if v_user_id is null or not private.is_team_owner(p_team_id) then
    raise exception 'Only an owner can manage devices' using errcode = '42501';
  end if;
  perform 1 from public.teams where id = p_team_id for update;
  if not private.is_team_owner(p_team_id) then
    raise exception 'Only an owner can manage devices' using errcode = '42501';
  end if;
  if p_role is null or p_role not in ('owner', 'editor', 'viewer') then
    raise exception 'Invalid membership role' using errcode = '22023';
  end if;
  select membership.role into v_previous_role
  from public.team_memberships membership
  where membership.team_id = p_team_id and membership.auth_user_id = p_auth_user_id
  for update;
  if not found then raise exception 'Device membership not found' using errcode = 'P0002'; end if;
  if v_previous_role = 'owner' and p_role <> 'owner' and (
    select count(*) from public.team_memberships membership
    where membership.team_id = p_team_id and membership.role = 'owner'
  ) = 1 then
    raise exception 'A team must keep at least one owner' using errcode = 'P0001';
  end if;

  update public.team_memberships membership
  set role = p_role, device_name = v_device_name
  where membership.team_id = p_team_id and membership.auth_user_id = p_auth_user_id;
  insert into public.team_access_audit (team_id, actor_user_id, target_user_id, action, details)
  values (p_team_id, v_user_id, p_auth_user_id, 'member_updated', jsonb_build_object(
    'previous_role', v_previous_role, 'role', p_role, 'device_name', v_device_name
  ));
end;
$$;

create or replace function public.revoke_team_device(p_team_id uuid, p_auth_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_device_name text;
begin
  if v_user_id is null or not private.is_team_owner(p_team_id) then
    raise exception 'Only an owner can manage devices' using errcode = '42501';
  end if;
  perform 1 from public.teams where id = p_team_id for update;
  if not private.is_team_owner(p_team_id) then
    raise exception 'Only an owner can manage devices' using errcode = '42501';
  end if;
  select membership.role, membership.device_name into v_role, v_device_name
  from public.team_memberships membership
  where membership.team_id = p_team_id and membership.auth_user_id = p_auth_user_id
  for update;
  if not found then raise exception 'Device membership not found' using errcode = 'P0002'; end if;
  if v_role = 'owner' and (
    select count(*) from public.team_memberships membership
    where membership.team_id = p_team_id and membership.role = 'owner'
  ) = 1 then
    raise exception 'The last owner cannot be revoked' using errcode = 'P0001';
  end if;

  delete from public.team_memberships membership
  where membership.team_id = p_team_id and membership.auth_user_id = p_auth_user_id;
  insert into public.team_access_audit (team_id, actor_user_id, target_user_id, action, details)
  values (p_team_id, v_user_id, p_auth_user_id, 'member_revoked', jsonb_build_object(
    'role', v_role, 'device_name', v_device_name
  ));
end;
$$;

revoke all on function public.create_team_invite(uuid, text, integer),
  public.consume_team_invite(text, text), public.list_team_devices(uuid),
  public.touch_device_memberships(),
  public.update_team_device(uuid, uuid, text, text), public.revoke_team_device(uuid, uuid)
  from public, anon;
grant execute on function public.create_team_invite(uuid, text, integer),
  public.consume_team_invite(text, text), public.list_team_devices(uuid),
  public.touch_device_memberships(),
  public.update_team_device(uuid, uuid, text, text), public.revoke_team_device(uuid, uuid)
  to authenticated;

commit;
