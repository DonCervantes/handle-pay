-- =============================================================================
-- Migraciones pendientes de Handle — generado 2026-11-07 desde integracion-fase-4-5
-- Pegar COMPLETO en Supabase → SQL Editor del proyecto handle-pey y dar Run.
-- Todo va en UNA transacción: si algo falla, no se aplica nada.
-- Después correr las pruebas de supabase/pendientes/LEEME.md, una por una.
-- =============================================================================
begin;

-- >>>>>>>>>>>>>>>>>>>>>>>> 20261108030000_mapa_publico.sql >>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- Fase 5 · Mapa público (HND-050 a HND-053)
--
-- `businesses` solo lo lee su organización o la red (RLS) y guarda datos
-- sensibles (RFC, CURP, razón social —que en persona física es el nombre de la
-- persona—, teléfono). El mapa y el perfil público leen SOLO esta función, que
-- expone una lista blanca de columnas de negocios aprobados y activos.
--
-- Por qué función security definer y no vista: una vista con los permisos del
-- dueño (security_invoker = false) es lo que el advisor de Supabase marca como
-- error ("security definer view"), y una vista security_invoker obligaría a
-- abrir `businesses` a anon con RLS + grants por columna. La función fija las
-- columnas y el filtro en un solo lugar y PostgREST permite filtrarla
-- (supabase.rpc("negocios_publicos").eq("categoria", ...)).
--
-- NUNCA agregar aquí: rfc, curp, razon_social, telefono, cp, org_id, estado_kyb,
-- documentos KYB ni nada de pey_accounts (CLABE / cuenta bancaria).
--
-- HND-053 (recomendado) no necesita cambios de esquema: la columna ya existe,
-- el check `businesses_recomendado_requiere_aprobacion` exige expediente
-- aprobado y el trigger `guard_business_write` impide que el dueño la cambie;
-- solo admin_red (RLS businesses_update) o service_role pueden.
-- Prueba: supabase/tests/mapa_publico.sql (se revierte sola).
-- =============================================================================

create or replace function public.negocios_publicos()
returns table (
  id                uuid,
  nombre_comercial  text,
  categoria         public.categoria_negocio,
  direccion         text,
  lat               numeric,
  lng               numeric,
  horario           jsonb,
  recomendado       boolean,
  puntos_porcentaje numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id,
         b.nombre_comercial,
         b.categoria,
         b.direccion,
         b.lat,
         b.lng,
         b.horario,
         b.recomendado,
         r.porcentaje as puntos_porcentaje
    from public.businesses b
    left join public.point_rules r on r.business_id = b.id and r.activo
   where b.estado_kyb = 'aprobado'
     and b.activo
$$;

comment on function public.negocios_publicos() is
  'Mapa público (HND-050/052): datos NO sensibles de negocios aprobados y activos. Sin RFC, CURP, razón social, teléfono ni datos bancarios.';
comment on column public.businesses.recomendado is
  'HND-053: destacado en el mapa público. Solo lo cambia admin_red (guard_business_write) y requiere expediente aprobado.';

revoke execute on function public.negocios_publicos() from public;
grant  execute on function public.negocios_publicos() to anon, authenticated;

-- <<<<<<<<<<<<<<<<<<<<<<<< fin 20261108030000_mapa_publico.sql <<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>> 20261108040201_seguridad_cobros_search_path.sql >>>>>>>>>>>>>>>>>>>>>>>>

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

-- <<<<<<<<<<<<<<<<<<<<<<<< fin 20261108040201_seguridad_cobros_search_path.sql <<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>> 20261108040301_job_vencer_cobros.sql >>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- HND-116 · Job programado que vence los cobros pendientes
--
-- Hoy un cobro abandonado solo pasa a "expirado" cuando alguien vuelve a abrir la
-- caja (estadoCaja) o cuando verificarCobro lo revisa. Este job llama cada 5
-- minutos a vencer_cobros_pendientes() sin argumento (todos los negocios), que
-- cierra como "expirado" los pendientes con más de 15 min y devuelve los puntos
-- reservados (cerrar_cobro). Es idempotente: un cobro ya cerrado no se toca, y si
-- después llega el pago, registrar_pago_pey() lo concilia igual.
--
-- pg_cron corre el job como el dueño de la migración (postgres), que puede
-- ejecutar la función aunque esté revocada para anon/authenticated.
-- Reaplicar esta migración no duplica el job: cron.schedule con el mismo nombre
-- lo actualiza.
-- =============================================================================

create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;

select cron.schedule(
  'vencer-cobros-pendientes',
  '*/5 * * * *',
  $job$select public.vencer_cobros_pendientes()$job$
);

-- <<<<<<<<<<<<<<<<<<<<<<<< fin 20261108040301_job_vencer_cobros.sql <<<<<<<<<<<<<<<<<<<<<<<<

-- >>>>>>>>>>>>>>>>>>>>>>>> 20261108040401_aceptacion_legal.sql >>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- HND-061 · Aceptación de términos y aviso de privacidad
--
-- El formulario de registro (/auth, "Crear cuenta") exige marcar la aceptación y
-- manda en los metadatos del registro las versiones aceptadas:
--   raw_user_meta_data.terminos_version   = 'AAAA-MM-DD'
--   raw_user_meta_data.privacidad_version = 'AAAA-MM-DD'
-- Un trigger en auth.users las guarda en legal_acceptances con la hora del
-- servidor. Es independiente de handle_new_user (no lo modifica) y nunca hace
-- fallar el alta: si faltan las versiones o vienen mal formadas, no registra nada
-- (p. ej. miembros de equipo creados por invitación desde el servidor).
--
-- El registro es inmutable para los usuarios: cada quien solo puede LEER sus
-- propias aceptaciones; escribir lo hace el trigger (security definer) o el
-- service_role. Se permite más de una fila por persona para futuras versiones.
-- =============================================================================

create table public.legal_acceptances (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  terminos_version   text not null check (terminos_version ~ '^\d{4}-\d{2}-\d{2}$'),
  privacidad_version text not null check (privacidad_version ~ '^\d{4}-\d{2}-\d{2}$'),
  accepted_at        timestamptz not null default now(),
  unique (user_id, terminos_version, privacidad_version)
);

comment on table public.legal_acceptances is
  'HND-061: versiones de términos y aviso de privacidad aceptadas por cada usuario (inmutable para clientes).';

alter table public.legal_acceptances enable row level security;
revoke all on public.legal_acceptances from anon, authenticated;
grant select on public.legal_acceptances to authenticated;

create policy legal_acceptances_select_propias on public.legal_acceptances
  for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.registrar_aceptacion_legal()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  _terminos   text := new.raw_user_meta_data ->> 'terminos_version';
  _privacidad text := new.raw_user_meta_data ->> 'privacidad_version';
begin
  if _terminos ~ '^\d{4}-\d{2}-\d{2}$' and _privacidad ~ '^\d{4}-\d{2}-\d{2}$' then
    insert into public.legal_acceptances (user_id, terminos_version, privacidad_version)
    values (new.id, _terminos, _privacidad)
    on conflict (user_id, terminos_version, privacidad_version) do nothing;
  end if;
  return new;
end
$$;

-- Función interna de trigger: no invocable por RPC desde el cliente.
revoke all on function public.registrar_aceptacion_legal() from public, anon, authenticated;

create trigger on_auth_user_created_aceptacion_legal
  after insert on auth.users
  for each row execute function public.registrar_aceptacion_legal();

-- <<<<<<<<<<<<<<<<<<<<<<<< fin 20261108040401_aceptacion_legal.sql <<<<<<<<<<<<<<<<<<<<<<<<

commit;
