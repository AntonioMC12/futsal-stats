-- Run after migration 0011 in a disposable Supabase database or SQL editor.
-- It performs read-only assertions and needs no Team fixtures.
do $$
declare
  v_team text := '3cc467c5-0a7a-4c53-9001-da3b0a0e0140';
  v_player text := '82561dce-e51a-4e2e-87a0-b0486a31e232';
begin
  if private.can_access_player_photo('teams//players/' || v_player || '/profile') is distinct from false then
    raise exception 'Empty Team segment was accepted';
  end if;
  if private.can_access_player_photo('teams/' || v_team || '/players//profile') is distinct from false then
    raise exception 'Empty Player segment was accepted';
  end if;
  if private.can_access_player_photo('teams/' || v_team || '/players/' || v_player || '/profile/extra') is distinct from false then
    raise exception 'Extra path segment was accepted';
  end if;
  if private.can_access_player_photo('teams/' || v_team || '/players/' || v_player || '/profile') is null then
    raise exception 'Valid legacy path returned NULL';
  end if;
end;
$$;
