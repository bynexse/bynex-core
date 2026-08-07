begin;

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(procedure.oid)
  into v_definition
  from pg_proc procedure
  join pg_namespace namespace on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'book_supplier_invoice_one_click'
    and pg_get_function_identity_arguments(procedure.oid) =
      'p_organization_id uuid, p_supplier_invoice_id uuid';

  if v_definition is null then
    raise exception 'book_supplier_invoice_one_click function is missing';
  end if;

  if position('#variable_conflict use_column' in v_definition) = 0 then
    v_definition := replace(
      v_definition,
      E'AS $function$\ndeclare',
      E'AS $function$\n#variable_conflict use_column\ndeclare'
    );

    if position('#variable_conflict use_column' in v_definition) = 0 then
      raise exception 'Could not harden PL/pgSQL column resolution';
    end if;

    execute v_definition;
  end if;
end;
$$;

revoke all on function public.book_supplier_invoice_one_click(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.book_supplier_invoice_one_click_safe(uuid, uuid)
  to authenticated;
grant execute on function public.review_and_book_supplier_invoice_one_click(
  uuid, uuid, uuid, uuid, text, date, date, text, numeric, numeric, numeric,
  text, text, text
) to authenticated;

comment on function public.book_supplier_invoice_one_click(uuid, uuid) is
  'Internal one-click posting engine with explicit table-column precedence for all PL/pgSQL identifiers.';

select pg_notify('pgrst', 'reload schema');

commit;
