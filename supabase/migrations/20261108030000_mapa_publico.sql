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
