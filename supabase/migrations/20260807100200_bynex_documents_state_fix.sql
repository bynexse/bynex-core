begin;

do $$
declare
  constraint_name text;
begin
  select con.conname
  into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'bynex_documents'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%context_type%'
    and pg_get_constraintdef(con.oid) ilike '%supplier_invoice%'
    and pg_get_constraintdef(con.oid) ilike '%supplier_invoice_id%'
  limit 1;

  if constraint_name is not null then
    execute format(
      'alter table public.bynex_documents drop constraint %I',
      constraint_name
    );
  end if;
end;
$$;

comment on column public.bynex_documents.supplier_invoice_id is
  'Set only after a permitted human applies a supplier-invoice proposal. Upload, analysis, rejection, failure and archive states may legitimately have no supplier invoice row.';

select pg_notify('pgrst', 'reload schema');

commit;
