-- =============================================================================
-- HND-004 · Optimización de RLS (avisos del Performance Advisor)
-- 1) Las políticas "for all" de escritura se traslapaban con las de lectura y
--    Postgres evaluaba ambas en cada SELECT. Se separan en insert/update/delete.
-- 2) Las políticas de update duplicadas (gerencia + red) se fusionan en una.
-- 3) Índices para llaves foráneas sin cubrir (varios son org_id, que filtra RLS).
-- La semántica de acceso NO cambia.
-- =============================================================================

-- accounts ---------------------------------------------------------------------
drop policy accounts_write on public.accounts;
create policy accounts_insert on public.accounts for insert to authenticated
  with check (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'finance'])));
create policy accounts_update on public.accounts for update to authenticated
  using (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'finance'])))
  with check (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'finance'])));
create policy accounts_delete on public.accounts for delete to authenticated
  using (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'finance'])));

-- transactions -----------------------------------------------------------------
drop policy transactions_write on public.transactions;
create policy transactions_insert on public.transactions for insert to authenticated
  with check (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'finance'])));
create policy transactions_update on public.transactions for update to authenticated
  using (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'finance'])))
  with check (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'finance'])));
create policy transactions_delete on public.transactions for delete to authenticated
  using (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'finance'])));

-- clients ----------------------------------------------------------------------
drop policy clients_write on public.clients;
create policy clients_insert on public.clients for insert to authenticated
  with check (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'finance', 'sales'])));
create policy clients_update on public.clients for update to authenticated
  using (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'finance', 'sales'])))
  with check (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'finance', 'sales'])));
create policy clients_delete on public.clients for delete to authenticated
  using (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'finance', 'sales'])));

-- client_contacts --------------------------------------------------------------
drop policy client_contacts_write on public.client_contacts;
create policy client_contacts_insert on public.client_contacts for insert to authenticated
  with check (
    (select public.has_role(array['owner', 'admin', 'finance', 'sales']))
    and exists (select 1 from public.clients c where c.id = client_id and c.org_id = (select public.current_org_id()))
  );
create policy client_contacts_update on public.client_contacts for update to authenticated
  using (
    (select public.has_role(array['owner', 'admin', 'finance', 'sales']))
    and exists (select 1 from public.clients c where c.id = client_id and c.org_id = (select public.current_org_id()))
  )
  with check (
    (select public.has_role(array['owner', 'admin', 'finance', 'sales']))
    and exists (select 1 from public.clients c where c.id = client_id and c.org_id = (select public.current_org_id()))
  );
create policy client_contacts_delete on public.client_contacts for delete to authenticated
  using (
    (select public.has_role(array['owner', 'admin', 'finance', 'sales']))
    and exists (select 1 from public.clients c where c.id = client_id and c.org_id = (select public.current_org_id()))
  );

-- employees --------------------------------------------------------------------
drop policy employees_write on public.employees;
create policy employees_insert on public.employees for insert to authenticated
  with check (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'hr'])));
create policy employees_update on public.employees for update to authenticated
  using (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'hr'])))
  with check (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'hr'])));
create policy employees_delete on public.employees for delete to authenticated
  using (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'hr'])));

-- leave_requests ---------------------------------------------------------------
drop policy leave_requests_write on public.leave_requests;
create policy leave_requests_insert on public.leave_requests for insert to authenticated
  with check (
    (select public.has_role(array['owner', 'admin', 'hr']))
    and exists (select 1 from public.employees e where e.id = employee_id and e.org_id = (select public.current_org_id()))
  );
create policy leave_requests_update on public.leave_requests for update to authenticated
  using (
    (select public.has_role(array['owner', 'admin', 'hr']))
    and exists (select 1 from public.employees e where e.id = employee_id and e.org_id = (select public.current_org_id()))
  )
  with check (
    (select public.has_role(array['owner', 'admin', 'hr']))
    and exists (select 1 from public.employees e where e.id = employee_id and e.org_id = (select public.current_org_id()))
  );
create policy leave_requests_delete on public.leave_requests for delete to authenticated
  using (
    (select public.has_role(array['owner', 'admin', 'hr']))
    and exists (select 1 from public.employees e where e.id = employee_id and e.org_id = (select public.current_org_id()))
  );

-- suppliers --------------------------------------------------------------------
drop policy suppliers_write on public.suppliers;
create policy suppliers_insert on public.suppliers for insert to authenticated
  with check (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'finance'])));
create policy suppliers_update on public.suppliers for update to authenticated
  using (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'finance'])))
  with check (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'finance'])));
create policy suppliers_delete on public.suppliers for delete to authenticated
  using (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'finance'])));

-- payments ---------------------------------------------------------------------
drop policy payments_write on public.payments;
create policy payments_insert on public.payments for insert to authenticated
  with check (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'finance'])));
create policy payments_update on public.payments for update to authenticated
  using (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'finance'])))
  with check (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'finance'])));
create policy payments_delete on public.payments for delete to authenticated
  using (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'finance'])));

-- businesses: una sola política de update (gerencia de la org O admin de red) ----
drop policy businesses_update_gerencia on public.businesses;
drop policy businesses_update_red on public.businesses;
create policy businesses_update on public.businesses for update to authenticated
  using (
    (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin'])))
    or (select public.is_admin_red())
  )
  with check (org_id = (select public.current_org_id()) or (select public.is_admin_red()));

-- kyb_documents ----------------------------------------------------------------
drop policy kyb_documents_write_gerencia on public.kyb_documents;
drop policy kyb_documents_update_red on public.kyb_documents;
create policy kyb_documents_insert on public.kyb_documents for insert to authenticated
  with check (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin'])));
create policy kyb_documents_update on public.kyb_documents for update to authenticated
  using (
    (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin'])))
    or (select public.is_admin_red())
  )
  with check (
    (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin'])))
    or (select public.is_admin_red())
  );
create policy kyb_documents_delete on public.kyb_documents for delete to authenticated
  using (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin'])));

-- point_rules ------------------------------------------------------------------
drop policy point_rules_write on public.point_rules;
create policy point_rules_insert on public.point_rules for insert to authenticated
  with check (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin'])));
create policy point_rules_update on public.point_rules for update to authenticated
  using (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin'])))
  with check (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin'])));
create policy point_rules_delete on public.point_rules for delete to authenticated
  using (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin'])));

-- Índices para llaves foráneas -------------------------------------------------
create index charges_cajero_id_idx            on public.charges (cajero_id);
create index charges_org_created_idx          on public.charges (org_id, created_at desc);
create index kyb_documents_org_id_idx         on public.kyb_documents (org_id);
create index kyb_reviews_org_id_idx           on public.kyb_reviews (org_id);
create index kyb_reviews_reviewer_id_idx      on public.kyb_reviews (reviewer_id);
create index payments_supplier_id_idx         on public.payments (supplier_id);
create index pey_accounts_org_id_idx          on public.pey_accounts (org_id);
create index point_rules_org_id_idx           on public.point_rules (org_id);
create index point_transactions_business_idx  on public.point_transactions (business_id);
create index point_transactions_org_id_idx    on public.point_transactions (org_id);
create index transactions_payment_id_idx      on public.transactions (payment_id);
create index transactions_supplier_id_idx     on public.transactions (supplier_id);
