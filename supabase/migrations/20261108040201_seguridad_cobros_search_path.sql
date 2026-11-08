-- =============================================================================
-- T2 · Seguridad en BD (hallazgos de revisión)
--
-- 1) charges_insert_caja: un cajero con su sesión podía insertar un cobro con
--    CUALQUIER customer_id de la red. Así se "ligaba" a un cliente ajeno (y,
--    por customers_select, podía leer su nombre, correo y nivel). Ahora la caja
--    solo puede poner un cliente que ya esté ligado a su org (tiene cobros o
--    movimientos de puntos ahí) o dejarlo vacío.
--
--    El primer cobro de un cliente nuevo lo liga el servidor (service_role) con
--    asignar_cliente_cobro(), después de identificarlo con cliente_por_email().
--
-- 2) search_path = '' en las funciones security definer que usan las políticas
--    RLS (is_admin_red, current_org_id, has_role y my_customer_id). Sus cuerpos
--    ya califican todo con esquema (public.profiles, auth.uid()).
-- =============================================================================

-- 1) Política de inserción de la caja -----------------------------------------

-- ¿El cliente ya tiene cobros o puntos en la org de quien llama? Security
-- definer porque una política de charges no puede consultar charges (recursión).
-- Solo responde sí/no para la org propia: no revela nada que customers_select
-- no deje ver ya.
create or replace function public.cliente_ligado_a_mi_org(_customer_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.charges
                  where customer_id = _customer_id and org_id = public.current_org_id())
      or exists (select 1 from public.point_transactions
                  where customer_id = _customer_id and org_id = public.current_org_id())
$$;
revoke execute on function public.cliente_ligado_a_mi_org(uuid) from public, anon;
grant  execute on function public.cliente_ligado_a_mi_org(uuid) to authenticated;

drop policy if exists charges_insert_caja on public.charges;
create policy charges_insert_caja on public.charges for insert to authenticated
  with check (
    org_id = (select public.current_org_id())
    and (select public.has_role(array['owner', 'admin', 'cajero']))
    and estado = 'pendiente'
    and paid_at is null
    and pey_charge_id is null
    and descuento_puntos = 0
    and (cajero_id is null or cajero_id = (select auth.uid()))
    and (customer_id is null or public.cliente_ligado_a_mi_org(customer_id))
  );

-- Liga un cliente a un cobro pendiente recién creado (solo servidor).
create or replace function public.asignar_cliente_cobro(_charge_id uuid, _customer_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  _cobro public.charges%rowtype;
begin
  select * into _cobro from public.charges where id = _charge_id for update;
  if not found then
    raise exception 'Cobro % no encontrado', _charge_id using errcode = 'no_data_found';
  end if;
  if _cobro.customer_id is not distinct from _customer_id then
    return; -- idempotente
  end if;
  if _cobro.customer_id is not null then
    raise exception 'Este cobro ya tiene cliente' using errcode = 'check_violation';
  end if;
  if _cobro.estado <> 'pendiente' or _cobro.descuento_puntos > 0 then
    raise exception 'Este cobro ya no admite asignar cliente' using errcode = 'check_violation';
  end if;
  if not exists (select 1 from public.customers where id = _customer_id) then
    raise exception 'Cliente % no encontrado', _customer_id using errcode = 'no_data_found';
  end if;
  update public.charges set customer_id = _customer_id where id = _charge_id;
end
$$;

revoke execute on function public.asignar_cliente_cobro(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.asignar_cliente_cobro(uuid, uuid) to service_role;

-- 2) search_path vacío en las funciones de las políticas -----------------------
alter function public.is_admin_red()     set search_path = '';
alter function public.current_org_id()   set search_path = '';
alter function public.has_role(text[])   set search_path = '';
alter function public.my_customer_id()   set search_path = '';
