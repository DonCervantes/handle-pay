-- =============================================================================
-- HND-004 · Políticas RLS por organización y rol + guardas de escritura
--
-- Roles (profiles.role):
--   owner, admin           → gerencia de su organización
--   finance, hr, sales     → oficina: leen el ERP, escriben solo su área
--   cajero                 → caja: su negocio, cobros y reglas de puntos; NADA de finanzas
--   admin_red              → red Handle (global): revisa KYB, activa y recomienda negocios
--   cliente                → solo sus datos, cobros y puntos
--   anon (sin sesión)      → sin acceso (el mapa público se resuelve en HND-050)
--
-- Convención de rendimiento: las funciones se envuelven en (select ...) para
-- que Postgres las evalúe una vez por consulta y no una vez por fila.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Funciones auxiliares (security definer: leen profiles/customers sin RLS)
-- -----------------------------------------------------------------------------
create or replace function public.has_role(_roles text[])
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select role = any (_roles) from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_admin_red()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select role = 'admin_red' from public.profiles where id = auth.uid()), false)
$$;

-- Id de cliente final del usuario autenticado (rompe el ciclo customers ↔ charges en RLS).
create or replace function public.my_customer_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select id from public.customers where user_id = auth.uid()
$$;

revoke execute on function public.has_role(text[]) from public, anon;
revoke execute on function public.is_admin_red()   from public, anon;
revoke execute on function public.my_customer_id() from public, anon;
grant  execute on function public.has_role(text[]) to authenticated;
grant  execute on function public.is_admin_red()   to authenticated;
grant  execute on function public.my_customer_id() to authenticated;

-- =============================================================================
-- ERP base
-- =============================================================================

-- Organizaciones ---------------------------------------------------------------
create policy organizations_select on public.organizations for select to authenticated
  using (id = (select public.current_org_id()) or (select public.is_admin_red()));
create policy organizations_update on public.organizations for update to authenticated
  using (id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin'])))
  with check (id = (select public.current_org_id()));

-- Perfiles ---------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or org_id = (select public.current_org_id())
    or (select public.is_admin_red())
  );
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
-- Solo se puede editar el nombre: rol y org_id quedan fuera del alcance del cliente.
revoke update on public.profiles from authenticated;
grant  update (full_name) on public.profiles to authenticated;

-- Cuentas ----------------------------------------------------------------------
create policy accounts_select on public.accounts for select to authenticated
  using (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'finance', 'hr', 'sales'])));
create policy accounts_write on public.accounts for all to authenticated
  using (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'finance'])))
  with check (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'finance'])));

-- Movimientos ------------------------------------------------------------------
create policy transactions_select on public.transactions for select to authenticated
  using (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'finance', 'hr', 'sales'])));
create policy transactions_write on public.transactions for all to authenticated
  using (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'finance'])))
  with check (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'finance'])));

-- Clientes del ERP (CRM) -------------------------------------------------------
create policy clients_select on public.clients for select to authenticated
  using (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'finance', 'hr', 'sales'])));
create policy clients_write on public.clients for all to authenticated
  using (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'finance', 'sales'])))
  with check (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'finance', 'sales'])));

create policy client_contacts_select on public.client_contacts for select to authenticated
  using (
    (select public.has_role(array['owner', 'admin', 'finance', 'hr', 'sales']))
    and exists (select 1 from public.clients c where c.id = client_id and c.org_id = (select public.current_org_id()))
  );
create policy client_contacts_write on public.client_contacts for all to authenticated
  using (
    (select public.has_role(array['owner', 'admin', 'finance', 'sales']))
    and exists (select 1 from public.clients c where c.id = client_id and c.org_id = (select public.current_org_id()))
  )
  with check (
    (select public.has_role(array['owner', 'admin', 'finance', 'sales']))
    and exists (select 1 from public.clients c where c.id = client_id and c.org_id = (select public.current_org_id()))
  );

-- Colaboradores ----------------------------------------------------------------
create policy employees_select on public.employees for select to authenticated
  using (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'finance', 'hr', 'sales'])));
create policy employees_write on public.employees for all to authenticated
  using (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'hr'])))
  with check (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'hr'])));

create policy leave_requests_select on public.leave_requests for select to authenticated
  using (
    (select public.has_role(array['owner', 'admin', 'finance', 'hr', 'sales']))
    and exists (select 1 from public.employees e where e.id = employee_id and e.org_id = (select public.current_org_id()))
  );
create policy leave_requests_write on public.leave_requests for all to authenticated
  using (
    (select public.has_role(array['owner', 'admin', 'hr']))
    and exists (select 1 from public.employees e where e.id = employee_id and e.org_id = (select public.current_org_id()))
  )
  with check (
    (select public.has_role(array['owner', 'admin', 'hr']))
    and exists (select 1 from public.employees e where e.id = employee_id and e.org_id = (select public.current_org_id()))
  );

-- Proveedores y pagos a proveedores -------------------------------------------
create policy suppliers_select on public.suppliers for select to authenticated
  using (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'finance', 'hr', 'sales'])));
create policy suppliers_write on public.suppliers for all to authenticated
  using (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'finance'])))
  with check (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'finance'])));

create policy payments_select on public.payments for select to authenticated
  using (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'finance', 'hr', 'sales'])));
create policy payments_write on public.payments for all to authenticated
  using (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'finance'])))
  with check (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'finance'])));

-- IA (bitácora del asistente) --------------------------------------------------
create policy agent_runs_select on public.agent_runs for select to authenticated
  using (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'finance', 'hr', 'sales'])));
create policy agent_runs_insert on public.agent_runs for insert to authenticated
  with check (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'finance', 'hr', 'sales'])));

-- API keys ---------------------------------------------------------------------
create policy api_keys_gerencia on public.api_keys for all to authenticated
  using (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin'])))
  with check (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin'])));

-- =============================================================================
-- Red Handle
-- =============================================================================

-- Negocios ---------------------------------------------------------------------
-- Todo el personal de la org (incluido cajero) ve su negocio; admin_red ve todos.
create policy businesses_select on public.businesses for select to authenticated
  using (org_id = (select public.current_org_id()) or (select public.is_admin_red()));
create policy businesses_insert on public.businesses for insert to authenticated
  with check (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin'])));
create policy businesses_update_gerencia on public.businesses for update to authenticated
  using (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin'])))
  with check (org_id = (select public.current_org_id()));
create policy businesses_update_red on public.businesses for update to authenticated
  using ((select public.is_admin_red()))
  with check ((select public.is_admin_red()));

-- Guarda: el dueño NO puede autoaprobarse, activarse, recomendarse ni mover su pin,
-- y no puede cambiar datos fiscales mientras el expediente está en revisión o aprobado.
-- Aplica solo a usuarios finales (rol authenticated); service_role y admin_red pasan.
create or replace function public.guard_business_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' or public.is_admin_red() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.estado_kyb  := 'borrador';
    new.activo      := false;
    new.recomendado := false;
    new.lat         := null;
    new.lng         := null;
    return new;
  end if;

  if new.org_id is distinct from old.org_id then
    raise exception 'No se puede cambiar la organización de un negocio' using errcode = 'insufficient_privilege';
  end if;

  if new.estado_kyb is distinct from old.estado_kyb
     and not (old.estado_kyb in ('borrador', 'rechazado') and new.estado_kyb in ('borrador', 'en_revision')) then
    raise exception 'Solo la red Handle puede cambiar el expediente de % a %', old.estado_kyb, new.estado_kyb
      using errcode = 'insufficient_privilege';
  end if;

  if new.activo is distinct from old.activo
     or new.recomendado is distinct from old.recomendado
     or new.lat is distinct from old.lat
     or new.lng is distinct from old.lng then
    raise exception 'Solo la red Handle puede activar, recomendar o ubicar un negocio'
      using errcode = 'insufficient_privilege';
  end if;

  if old.estado_kyb in ('en_revision', 'aprobado')
     and (new.razon_social, new.tipo_persona, new.rfc, new.curp, new.direccion, new.cp)
         is distinct from
         (old.razon_social, old.tipo_persona, old.rfc, old.curp, old.direccion, old.cp) then
    raise exception 'Los datos fiscales no se pueden editar con el expediente %', old.estado_kyb
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end
$$;

create trigger tg_05_guard before insert or update on public.businesses
  for each row execute function public.guard_business_write();

-- Documentos KYB ---------------------------------------------------------------
create policy kyb_documents_select on public.kyb_documents for select to authenticated
  using (
    (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin'])))
    or (select public.is_admin_red())
  );
create policy kyb_documents_write_gerencia on public.kyb_documents for all to authenticated
  using (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin'])))
  with check (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin'])));
create policy kyb_documents_update_red on public.kyb_documents for update to authenticated
  using ((select public.is_admin_red()))
  with check ((select public.is_admin_red()));

-- Guarda: el dueño sube documentos, pero solo la red los valida o rechaza.
-- Reemplazar el archivo regresa el documento a "pendiente".
create or replace function public.guard_kyb_document()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' or public.is_admin_red() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.estado := 'pendiente';
  elsif new.storage_path is distinct from old.storage_path then
    new.estado := 'pendiente';
  elsif new.estado is distinct from old.estado then
    raise exception 'Solo la red Handle valida documentos KYB' using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;

create trigger tg_05_guard before insert or update on public.kyb_documents
  for each row execute function public.guard_kyb_document();

-- Bitácora de revisión KYB (inmutable desde HND-003) --------------------------
create policy kyb_reviews_select on public.kyb_reviews for select to authenticated
  using (
    (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin'])))
    or (select public.is_admin_red())
  );
create policy kyb_reviews_insert_red on public.kyb_reviews for insert to authenticated
  with check ((select public.is_admin_red()) and reviewer_id = (select auth.uid()));

-- Cuenta Pey: solo lectura para gerencia; altas y cambios vía servidor (service_role).
create policy pey_accounts_select on public.pey_accounts for select to authenticated
  using (
    (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin'])))
    or (select public.is_admin_red())
  );

-- Clientes finales -------------------------------------------------------------
-- Cada cliente ve su ficha. El personal de caja solo ve clientes que ya le
-- compraron (no expone la lista completa de correos de la red).
-- Altas de clientes: vía servidor en HND-042 / HND-011.
create policy customers_select on public.customers for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select public.is_admin_red())
    or (
      (select public.has_role(array['owner', 'admin', 'finance', 'cajero']))
      and (
        exists (select 1 from public.charges ch
                 where ch.customer_id = customers.id and ch.org_id = (select public.current_org_id()))
        or exists (select 1 from public.point_transactions pt
                    where pt.customer_id = customers.id and pt.org_id = (select public.current_org_id()))
      )
    )
  );
create policy customers_update_self on public.customers for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
-- El cliente solo edita su nombre; el nivel lo asigna el sistema.
revoke update on public.customers from authenticated;
grant  update (nombre) on public.customers to authenticated;

-- Cobros -----------------------------------------------------------------------
create policy charges_select on public.charges for select to authenticated
  using (
    (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'finance', 'cajero'])))
    or (select public.is_admin_red())
    or customer_id = (select public.my_customer_id())
  );
-- La caja crea cobros SOLO en estado pendiente y sin canje; pagar, cancelar
-- y canjear puntos lo hace el servidor (webhook de Pey / service_role).
create policy charges_insert_caja on public.charges for insert to authenticated
  with check (
    org_id = (select public.current_org_id())
    and (select public.has_role(array['owner', 'admin', 'cajero']))
    and estado = 'pendiente'
    and paid_at is null
    and pey_charge_id is null
    and descuento_puntos = 0
    and (cajero_id is null or cajero_id = (select auth.uid()))
  );

-- Reglas de puntos -------------------------------------------------------------
create policy point_rules_select on public.point_rules for select to authenticated
  using (org_id = (select public.current_org_id()) or (select public.is_admin_red()));
create policy point_rules_write on public.point_rules for all to authenticated
  using (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin'])))
  with check (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin'])));

-- Ledger de puntos: solo lectura. Acumular y canjear lo hace el servidor.
create policy point_transactions_select on public.point_transactions for select to authenticated
  using (
    (org_id = (select public.current_org_id()) and (select public.has_role(array['owner', 'admin', 'finance', 'cajero'])))
    or (select public.is_admin_red())
    or customer_id = (select public.my_customer_id())
  );

-- Funciones de guarda: no invocables por RPC (los triggers siguen disparándose).
revoke execute on function public.guard_business_write() from public, anon, authenticated;
revoke execute on function public.guard_kyb_document()   from public, anon, authenticated;
