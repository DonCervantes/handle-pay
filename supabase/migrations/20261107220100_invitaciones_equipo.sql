-- =============================================================================
-- HND-011 · Corrección: alta de equipo con invitaciones pendientes
--
-- Problema detectado en la prueba de punta a punta: Supabase Auth
-- (POST /auth/v1/admin/users) INSERTA el usuario y escribe app_metadata en un
-- paso POSTERIOR. El trigger AFTER INSERT no veía org_id/role y el cajero
-- terminaba como dueño de una organización nueva.
--
-- Solución: el servidor registra primero la invitación (correo → org + rol) en
-- una tabla que solo service_role puede tocar; el trigger la consume al crearse
-- el usuario con ese correo. Ya no se usa app_metadata para la pertenencia.
-- =============================================================================

create table public.team_invites (
  email      text primary key check (email = lower(email)),
  org_id     uuid not null references public.organizations (id) on delete cascade,
  role       text not null check (role in ('cajero', 'admin')),
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index team_invites_org_id_idx on public.team_invites (org_id);
create index team_invites_invited_by_idx on public.team_invites (invited_by);

-- Sin políticas y sin permisos: solo service_role (que ignora RLS) puede leer o escribir.
alter table public.team_invites enable row level security;
revoke all on public.team_invites from anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  _org        uuid;
  _nombre     text := nullif(trim(new.raw_user_meta_data ->> 'full_name'), '');
  _email      text := lower(new.email);
  _equipo_org uuid;
  _equipo_rol text;
begin
  -- 1) Miembro de equipo: hay una invitación del servidor para este correo.
  delete from public.team_invites where email = _email
  returning org_id, role into _equipo_org, _equipo_rol;
  if _equipo_org is not null then
    insert into public.profiles (id, org_id, role, full_name, email)
    values (new.id, _equipo_org, _equipo_rol, _nombre, _email);
    return new;
  end if;

  -- 2) Cliente final: sin organización; liga la ficha que la caja ya le haya creado.
  if new.raw_user_meta_data ->> 'tipo_cuenta' = 'cliente' then
    insert into public.profiles (id, org_id, role, full_name, email)
    values (new.id, null, 'cliente', _nombre, _email);

    update public.customers
       set user_id = new.id, nombre = coalesce(nombre, _nombre)
     where lower(email) = _email and user_id is null;
    if not found then
      insert into public.customers (user_id, email, nombre) values (new.id, _email, _nombre);
    end if;
    return new;
  end if;

  -- 3) Dueño de negocio. El rol NUNCA se toma de los metadatos del registro.
  insert into public.organizations (name)
  values (coalesce(nullif(trim(new.raw_user_meta_data ->> 'org_name'), ''), 'Mi negocio'))
  returning id into _org;

  insert into public.profiles (id, org_id, role, full_name, email)
  values (new.id, _org, 'owner', _nombre, _email);

  perform public.seed_demo_data(_org);
  return new;
end
$$;
