-- =============================================================================
-- HND-003 · Endurecimiento de funciones (avisos del Security Advisor)
-- =============================================================================

-- search_path fijo en funciones de trigger que no lo tenían.
alter function public.set_updated_at()   set search_path = '';
alter function public.prevent_mutation() set search_path = '';

-- Las funciones de trigger no deben ser invocables por la API (/rest/v1/rpc).
-- Postgres solo verifica EXECUTE al crear el trigger, así que siguen disparándose.
revoke execute on function public.set_org_id()                from public, anon, authenticated;
revoke execute on function public.set_org_from_business()     from public, anon, authenticated;
revoke execute on function public.validate_transaction_refs() from public, anon, authenticated;
revoke execute on function public.validate_payment_refs()     from public, anon, authenticated;
revoke execute on function public.sync_account_balance()      from public, anon, authenticated;
revoke execute on function public.point_tx_compute_saldo()    from public, anon, authenticated;
revoke execute on function public.set_updated_at()            from public, anon, authenticated;
revoke execute on function public.prevent_mutation()          from public, anon, authenticated;

-- current_org_id() la usan las políticas RLS (HND-004): solo usuarios autenticados.
revoke execute on function public.current_org_id() from public, anon;
grant  execute on function public.current_org_id() to authenticated;
