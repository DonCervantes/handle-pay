-- =============================================================================
-- Prueba de 20261108030000_mapa_publico.sql (Fase 5 · Mapa)
--
-- Correr DESPUÉS de aplicar la migración, en el SQL editor de Supabase (como
-- postgres). Todo ocurre dentro de un bloque que termina con
-- raise exception 'OK': si ves "ERROR: OK" pasaron todos los escenarios y
-- NADA quedó escrito (la transacción se revierte). Cualquier otro error indica
-- qué escenario falló.
-- =============================================================================
do $$
declare
  _org_a   uuid := gen_random_uuid();  -- negocio aprobado y activo (sale en el mapa)
  _org_b   uuid := gen_random_uuid();  -- negocio en borrador (no sale)
  _org_c   uuid := gen_random_uuid();  -- aprobado pero inactivo (no sale)
  _org_red uuid := gen_random_uuid();
  _neg_a   uuid;
  _neg_b   uuid;
  _neg_c   uuid;
  _dueno   uuid := gen_random_uuid();
  _red     uuid := gen_random_uuid();
  _n       int;
  _fila    record;
  _cols    text[];
begin
  insert into public.organizations (id, name) values
    (_org_a, 'prueba mapa A'), (_org_b, 'prueba mapa B'),
    (_org_c, 'prueba mapa C'), (_org_red, 'prueba mapa red');

  insert into public.businesses
    (org_id, nombre_comercial, razon_social, tipo_persona, rfc, curp, categoria,
     telefono, direccion, cp, lat, lng, estado_kyb, activo, horario)
  values
    (_org_a, 'Abarrotes Prueba Mapa', 'JUANA PEREZ LOPEZ', 'fisica', 'PELJ800101AB1',
     'PELJ800101MDFRPN09', 'abarrotes', '5555555555', 'Calle Falsa 123, CDMX', '06000',
     19.432608, -99.133209, 'aprobado', true, '{"lun-sab": "8:00-21:00"}')
  returning id into _neg_a;

  insert into public.businesses (org_id, nombre_comercial, categoria)
  values (_org_b, 'Borrador Prueba Mapa', 'taqueria')
  returning id into _neg_b;

  insert into public.businesses
    (org_id, nombre_comercial, razon_social, tipo_persona, rfc, categoria, direccion, cp,
     estado_kyb, activo)
  values
    (_org_c, 'Inactivo Prueba Mapa', 'CARNES SA', 'moral', 'CAR800101AB1', 'carniceria',
     'Otra calle 1', '06000', 'aprobado', false)
  returning id into _neg_c;

  insert into public.point_rules (business_id, porcentaje) values (_neg_a, 5);

  -- 1) La función no expone columnas sensibles.
  select array_agg(a) into _cols
    from pg_proc p, unnest(p.proargnames) a
   where p.oid = 'public.negocios_publicos()'::regprocedure;
  if _cols && array['rfc', 'curp', 'razon_social', 'telefono', 'cp', 'org_id', 'clabe'] then
    raise exception 'FALLA 1: negocios_publicos expone columnas sensibles: %', _cols;
  end if;

  -- 2) Anónimo: ve solo aprobados y activos, con la promo de puntos.
  set local role anon;
  select count(*) into _n from public.negocios_publicos() where id in (_neg_a, _neg_b, _neg_c);
  if _n <> 1 then
    raise exception 'FALLA 2: anon debía ver 1 negocio de prueba y ve %', _n;
  end if;
  select * into _fila from public.negocios_publicos() where id = _neg_a;
  if _fila.nombre_comercial <> 'Abarrotes Prueba Mapa' or _fila.puntos_porcentaje <> 5
     or _fila.lat is null or _fila.recomendado then
    raise exception 'FALLA 2b: datos públicos inesperados: %', row_to_json(_fila);
  end if;

  -- 3) Anónimo sigue sin poder leer la tabla directamente.
  begin
    select count(*) into _n from public.businesses;
    if _n > 0 then
      raise exception 'FALLA 3: anon lee % filas de businesses', _n;
    end if;
  exception when insufficient_privilege then
    null; -- sin permiso: correcto
  end;
  reset role;

  -- Perfiles: un admin del negocio A y un admin de red.
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
  values
    (_dueno, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'dueno-mapa@handle-prueba.mx', jsonb_build_object('org_id', _org_a, 'role', 'admin'), '{}'),
    (_red, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'red-mapa@handle-prueba.mx', jsonb_build_object('org_id', _org_red, 'role', 'admin'), '{}');
  -- handle_new_user ya no lee raw_app_meta_data (usa team_invites desde
  -- 20261107220100): cada usuario nace dueño de una org propia. Se ligan a mano.
  update public.profiles set org_id = _org_a, role = 'admin' where id = _dueno;
  update public.profiles set org_id = _org_red, role = 'admin_red' where id = _red;

  -- 4) La gerencia del negocio NO puede recomendarse a sí misma (HND-053).
  perform set_config('request.jwt.claims', json_build_object('sub', _dueno, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    update public.businesses set recomendado = true where id = _neg_a;
    raise exception 'FALLA 4: el negocio se pudo recomendar a sí mismo';
  exception when insufficient_privilege then
    null;
  end;
  reset role;

  -- 5) La red sí lo recomienda, y se ve en el mapa.
  perform set_config('request.jwt.claims', json_build_object('sub', _red, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.businesses set recomendado = true where id = _neg_a;
  get diagnostics _n = row_count;
  if _n <> 1 then
    raise exception 'FALLA 5: admin_red no pudo recomendar (filas: %)', _n;
  end if;

  -- 6) Un negocio no aprobado no puede ser recomendado ni por la red.
  begin
    update public.businesses set recomendado = true where id = _neg_b;
    raise exception 'FALLA 6: se recomendó un negocio en borrador';
  exception when check_violation then
    null;
  end;
  reset role;

  set local role anon;
  select recomendado into _fila from public.negocios_publicos() where id = _neg_a;
  if not _fila.recomendado then
    raise exception 'FALLA 5b: el mapa no refleja el recomendado';
  end if;
  reset role;

  raise exception 'OK';
end
$$;
