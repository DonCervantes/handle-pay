-- =============================================================================
-- Fase 2 · KYB: expediente del negocio, documentos en Storage y revisión
--   HND-021  RFC consistente con el tipo de persona
--   HND-022  Bucket privado "kyb" con permisos por organización
--   HND-023  Enviar a revisión exige los 4 documentos
--   HND-024  revisar_expediente(): aprobación/rechazo atómico por la red
-- =============================================================================

-- HND-021: persona física = RFC de 13 caracteres; moral = 12.
alter table public.businesses add constraint businesses_rfc_segun_persona check (
  rfc is null
  or (tipo_persona = 'fisica' and length(rfc) = 13)
  or (tipo_persona = 'moral' and length(rfc) = 12)
);

-- -----------------------------------------------------------------------------
-- HND-023: un expediente solo entra a revisión con los 4 documentos.
-- Aplica a cualquiera (también a service_role): es una regla del negocio.
-- -----------------------------------------------------------------------------
create or replace function public.validar_envio_kyb()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  _faltan int;
begin
  if new.estado_kyb = 'en_revision' and old.estado_kyb is distinct from 'en_revision' then
    select 4 - count(distinct d.tipo) into _faltan
      from public.kyb_documents d
     where d.business_id = new.id;
    if _faltan > 0 then
      raise exception 'Faltan % documento(s) para enviar el expediente a revisión', _faltan
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end
$$;

create trigger tg_06_validar_envio before update on public.businesses
  for each row execute function public.validar_envio_kyb();

-- -----------------------------------------------------------------------------
-- Documentos: el dueño solo los sube, cambia o borra con el expediente en
-- borrador o rechazado. En revisión o aprobado quedan congelados para él.
-- Solo la red los valida o rechaza. Cambiar el archivo lo regresa a "pendiente".
-- -----------------------------------------------------------------------------
create or replace function public.guard_kyb_document()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  _estado public.estado_kyb;
begin
  if current_user <> 'authenticated' or public.is_admin_red() then
    return coalesce(new, old);
  end if;

  select b.estado_kyb into _estado
    from public.businesses b
   where b.id = coalesce(new.business_id, old.business_id);
  if _estado not in ('borrador', 'rechazado') then
    raise exception 'El expediente está %: sus documentos no se pueden modificar', _estado
      using errcode = 'insufficient_privilege';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  if tg_op = 'INSERT' or new.storage_path is distinct from old.storage_path then
    new.estado := 'pendiente';
  elsif new.estado is distinct from old.estado then
    raise exception 'Solo la red Handle valida documentos KYB' using errcode = 'insufficient_privilege';
  end if;
  return new;
end
$$;

drop trigger tg_05_guard on public.kyb_documents;
create trigger tg_05_guard before insert or update or delete on public.kyb_documents
  for each row execute function public.guard_kyb_document();

-- -----------------------------------------------------------------------------
-- HND-024: revisión atómica por la red. Registra la bitácora, marca los
-- documentos y cambia el estado del negocio en una sola transacción.
-- Aprobar activa el negocio; la ubicación (HND-025) la agrega el servidor.
-- -----------------------------------------------------------------------------
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

  update public.kyb_documents
     set estado = case when _decision = 'aprobado' then 'validado'::public.estado_documento
                       else 'rechazado'::public.estado_documento end
   where business_id = _business_id;

  update public.businesses
     set estado_kyb = _decision::text::public.estado_kyb,
         activo     = (_decision = 'aprobado')
   where id = _business_id;
end
$$;

revoke execute on function public.revisar_expediente(uuid, public.decision_kyb, text) from public, anon;
grant  execute on function public.revisar_expediente(uuid, public.decision_kyb, text) to authenticated;
revoke execute on function public.validar_envio_kyb() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- HND-022: bucket privado para documentos KYB.
-- Ruta de cada archivo: {org_id}/{tipo}-{timestamp}.{ext}
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kyb', 'kyb', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

-- Gerencia: ve los archivos de su org siempre; los sube/cambia/borra solo
-- mientras el expediente está en borrador o rechazado.
create policy kyb_storage_select_gerencia on storage.objects for select to authenticated
  using (
    bucket_id = 'kyb'
    and (storage.foldername(name))[1] = (select public.current_org_id())::text
    and (select public.has_role(array['owner', 'admin']))
  );

create policy kyb_storage_insert_gerencia on storage.objects for insert to authenticated
  with check (
    bucket_id = 'kyb'
    and (storage.foldername(name))[1] = (select public.current_org_id())::text
    and (select public.has_role(array['owner', 'admin']))
    and exists (
      select 1 from public.businesses b
       where b.org_id = (select public.current_org_id()) and b.estado_kyb in ('borrador', 'rechazado')
    )
  );

create policy kyb_storage_update_gerencia on storage.objects for update to authenticated
  using (
    bucket_id = 'kyb'
    and (storage.foldername(name))[1] = (select public.current_org_id())::text
    and (select public.has_role(array['owner', 'admin']))
    and exists (
      select 1 from public.businesses b
       where b.org_id = (select public.current_org_id()) and b.estado_kyb in ('borrador', 'rechazado')
    )
  );

create policy kyb_storage_delete_gerencia on storage.objects for delete to authenticated
  using (
    bucket_id = 'kyb'
    and (storage.foldername(name))[1] = (select public.current_org_id())::text
    and (select public.has_role(array['owner', 'admin']))
    and exists (
      select 1 from public.businesses b
       where b.org_id = (select public.current_org_id()) and b.estado_kyb in ('borrador', 'rechazado')
    )
  );

-- La red ve todos los documentos para revisarlos (solo lectura).
create policy kyb_storage_select_red on storage.objects for select to authenticated
  using (bucket_id = 'kyb' and (select public.is_admin_red()));
