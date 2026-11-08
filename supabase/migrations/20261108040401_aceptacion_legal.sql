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
