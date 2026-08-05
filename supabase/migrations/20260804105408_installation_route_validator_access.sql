begin;

-- The route validator is immutable, reads no tables and exposes no tenant data.
-- INSERT/UPDATE checks need permission to execute it for authenticated users.
grant execute on function private.valid_installation_route_path(jsonb,text)
  to authenticated;

commit;
