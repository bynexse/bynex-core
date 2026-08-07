begin;

-- The private asset-files bucket evaluates its RLS policy as the signed-in
-- database role. The policy helper remains SECURITY DEFINER with an empty
-- search_path, but authenticated users must be allowed to execute it so the
-- policy can perform its tenant and module checks.
revoke all on function private.can_access_asset_object(text, uuid)
  from public, anon;
grant execute on function private.can_access_asset_object(text, uuid)
  to authenticated;

commit;
