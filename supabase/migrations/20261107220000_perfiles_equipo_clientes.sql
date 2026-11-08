-- =============================================================================
-- HND-011 · Perfil, rol y pertenencia a la organización
--
-- Tres formas de crear una cuenta (trigger handle_new_user):
--   1) Miembro de equipo (cajero / admin): lo da de alta el SERVIDOR con
--      app_metadata { org_id, role }. app_metadata solo lo escribe service_role,
--      así que un registro público nunca puede unirse a una org ajena.
--   2) Cliente final: user_metadata.tipo_cuenta = 'cliente'. Sin organización;
--      se liga (o se crea) su ficha en customers por correo.
--   3) Dueño de negocio (por defecto): crea su organización + perfil owner.
--
-- Bajas: profiles.activo = false corta el acceso AL INSTANTE (las funciones de
-- identidad que usa RLS ignoran perfiles inactivos aunque el token siga vivo).
-- =============================================================================

alter table public.profiles add column email text;
alter table public.profiles add column activo boolean not null default true;
alter table public.profiles alter column org_id drop not null;

-- Personal siempre pertenece a una org; un cliente final nunca.
alter table public.profiles add constraint profiles_org_segun_rol check (
  (role = 'cliente' and org_id is null) or (role <> 'cliente' and org_id is not null)
);
create unique index profiles_email_unique on public.profiles (lower(email)) where email is not null;

-- -----------------------------------------------------------------------------
-- Funciones de identidad: un perfil dado de baja deja de tener org y rol.
-- (create or replace conserva los permisos de ejecución ya otorgados)
-- -----------------------------------------------------------------------------
create or replace function public.current_org_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select org_id from public.profiles where id = auth.uid() and activo
$$;

create or replace function public.has_role(_roles text[])
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select role = any (_roles) from public.profiles where id = auth.uid() and activo), false)
$$;

create or replace function public.is_admin_red()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((select role = 'admin_red' from public.profiles where id = auth.uid() and activo), false)
$$;

-- -----------------------------------------------------------------------------
-- Alta de usuario
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  _org        uuid;
  _nombre     text := nullif(trim(new.raw_user_meta_data ->> 'full_name'), '');
  _email      text := lower(new.email);
  _equipo_org uuid := nullif(new.raw_app_meta_data ->> 'org_id', '')::uuid;
  _equipo_rol text := new.raw_app_meta_data ->> 'role';
begin
  -- 1) Miembro de equipo dado de alta por el servidor.
  if _equipo_org is not null then
    if _equipo_rol is null or _equipo_rol not in ('cajero', 'admin') then
      raise exception 'Rol de equipo no permitido: %', coalesce(_equipo_rol, '(vacío)');
    end if;
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
