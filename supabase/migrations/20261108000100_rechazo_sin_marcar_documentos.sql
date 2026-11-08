-- =============================================================================
-- Fase 2 · Corrección: un rechazo ya no marca TODOS los documentos como
-- "rechazado". La revisión no dice qué documento falló (eso va en la nota), y
-- marcarlos todos hacía creer al dueño que documentos correctos estaban mal.
-- Al rechazar, los documentos se quedan como estaban; al aprobar, se validan.
-- =============================================================================

create or replace function public.revisar_expediente(
  _business_id uuid,
  _decision    public.decision_kyb,
  _notas       text default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  _estado public.estado_kyb;
begin
  if not public.is_admin_red() then
    raise exception 'Solo la red Handle revisa expedientes' using errcode = 'insufficient_privilege';
  end if;

  select estado_kyb into _estado from public.businesses where id = _business_id for update;
  if _estado is null then
    raise exception 'Negocio no encontrado' using errcode = 'no_data_found';
  end if;
  if _estado <> 'en_revision' then
    raise exception 'El expediente no está en revisión (está %)', _estado using errcode = 'check_violation';
  end if;
  if _decision = 'rechazado' and nullif(trim(coalesce(_notas, '')), '') is null then
    raise exception 'Para rechazar hay que explicar el motivo' using errcode = 'check_violation';
  end if;

  insert into public.kyb_reviews (business_id, reviewer_id, decision, notas)
  values (_business_id, auth.uid(), _decision, nullif(trim(coalesce(_notas, '')), ''));

  if _decision = 'aprobado' then
    update public.kyb_documents set estado = 'validado' where business_id = _business_id;
  end if;

  update public.businesses
     set estado_kyb = _decision::text::public.estado_kyb,
         activo     = (_decision = 'aprobado')
   where id = _business_id;
end
$$;

-- Documentos que quedaron marcados por la regla anterior vuelven a "pendiente".
update public.kyb_documents set estado = 'pendiente' where estado = 'rechazado';
