create or replace function public.get_my_team_role(p_team_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select membership.role
  from public.team_memberships membership
  where membership.team_id = p_team_id
    and membership.auth_user_id = auth.uid()
  limit 1
$$;

revoke all on function public.get_my_team_role(uuid) from public;
grant execute on function public.get_my_team_role(uuid) to authenticated;
