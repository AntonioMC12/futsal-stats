begin;

-- Keep the existing private bucket and objects. Storage paths already persisted as
-- teams/<team UUID>/players/<player UUID>/profile remain readable.
update storage.buckets
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'player-photos';

create or replace function private.can_access_player_photo(p_name text, p_write boolean default false)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_team_id uuid;
  v_player_id uuid;
begin
  -- Validate the entire path before any UUID cast. The legacy final segment is
  -- "profile"; new replacements use "profile-<UUID>" to avoid overwriting.
  if p_name is null or p_name !~* '^teams/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/players/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/profile(-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$' then
    return false;
  end if;
  v_team_id := split_part(p_name, '/', 2)::uuid;
  v_player_id := split_part(p_name, '/', 4)::uuid;
  return private.can_access_team(v_team_id, p_write)
    and exists (
      select 1 from public.players p
      where p.id = v_player_id and p.team_id = v_team_id and p.deleted_at is null
    );
end;
$$;

revoke all on function private.can_access_player_photo(text, boolean) from public, anon;
grant execute on function private.can_access_player_photo(text, boolean) to authenticated;

drop policy if exists player_photos_read on storage.objects;
drop policy if exists player_photos_insert on storage.objects;
drop policy if exists player_photos_update on storage.objects;
drop policy if exists player_photos_delete on storage.objects;

create policy player_photos_read on storage.objects for select to authenticated
  using (bucket_id = 'player-photos' and private.can_access_player_photo(name));
create policy player_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'player-photos' and private.can_access_player_photo(name, true));
create policy player_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'player-photos' and private.can_access_player_photo(name, true))
  with check (bucket_id = 'player-photos' and private.can_access_player_photo(name, true));
create policy player_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'player-photos' and private.can_access_player_photo(name, true));

commit;
