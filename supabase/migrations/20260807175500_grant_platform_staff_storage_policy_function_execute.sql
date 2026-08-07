-- Storage evaluates all permissive SELECT policies when it authorizes signed URLs.
-- The subscription invoice policy therefore needs authenticated callers to be
-- able to evaluate this tenant-safe platform-staff predicate even when another
-- private bucket is being opened.

revoke all on function private.is_platform_staff(text[])
  from public, anon;
grant execute on function private.is_platform_staff(text[])
  to authenticated;

select pg_notify('pgrst', 'reload schema');
