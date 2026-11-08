-- =============================================================================
-- Prueba de 20261108040401_aceptacion_legal.sql (HND-061)
--
-- Correr DESPUÉS de aplicar la migración, en el SQL editor de Supabase (como
-- postgres). Todo ocurre dentro de un bloque que termina con
-- raise exception 'OK': si ves "ERROR: OK" pasaron todos los escenarios y
-- NADA quedó escrito (la transacción se revierte). Cualquier otro error indica
-- qué escenario falló.
-- =============================================================================
do $$
declare
  _cliente uuid := gen_random_uuid();  -- se registra aceptando
  _dueno   uuid := gen_random_uuid();  -- se registra aceptando (negocio)
  _equipo  uuid := gen_random_uuid();  -- alta sin aceptación (invitación de servidor)
  _basura  uuid := gen_random_uuid();  -- metadatos mal formados
  _n       int;
  _fila    record;
begin
  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
  values
    (_cliente, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'e2e-legal-cliente@e2e.handle-prueba.mx', '{}',
     '{"full_name": "E2E Cliente Legal", "tipo_cuenta": "cliente",
       "terminos_version": "2026-11-07", "privacidad_version": "2026-11-07"}'),
    (_dueno, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'e2e-legal-dueno@e2e.handle-prueba.mx', '{}',
     '{"full_name": "E2E Dueño Legal", "tipo_cuenta": "negocio", "org_name": "E2E Negocio Legal",
       "terminos_version": "2026-11-07", "privacidad_version": "2026-11-07"}'),
    (_equipo, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'e2e-legal-equipo@e2e.handle-prueba.mx', '{}', '{"full_name": "E2E Equipo Legal"}'),
    (_basura, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'e2e-legal-basura@e2e.handle-prueba.mx', '{}',
     '{"full_name": "E2E Basura Legal", "tipo_cuenta": "cliente",
       "terminos_version": "si", "privacidad_version": "2026-11-07"}');

  -- 1) El alta sigue funcionando (handle_new_user no se rompió) y se registra la aceptación.
  select count(*) into _n from public.profiles where id in (_cliente, _dueno, _equipo, _basura);
  if _n <> 4 then
    raise exception 'FALLA 1: se esperaban 4 perfiles creados y hay %', _n;
  end if;
  select * into _fila from public.legal_acceptances where user_id = _cliente;
  if _fila is null or _fila.terminos_version <> '2026-11-07' or _fila.privacidad_version <> '2026-11-07'
     or _fila.accepted_at is null then
    raise exception 'FALLA 1b: aceptación del cliente inesperada: %', row_to_json(_fila);
  end if;
  select count(*) into _n from public.legal_acceptances where user_id = _dueno;
  if _n <> 1 then
    raise exception 'FALLA 1c: el dueño debía tener 1 aceptación y tiene %', _n;
  end if;

  -- 2) Sin versiones o con versiones mal formadas: no se registra nada y el alta no falla.
  select count(*) into _n from public.legal_acceptances where user_id in (_equipo, _basura);
  if _n <> 0 then
    raise exception 'FALLA 2: se registraron % aceptaciones sin versiones válidas', _n;
  end if;

  -- 3) Cada usuario lee solo sus propias aceptaciones.
  perform set_config('request.jwt.claims', json_build_object('sub', _cliente, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into _n from public.legal_acceptances where user_id in (_cliente, _dueno);
  if _n <> 1 then
    raise exception 'FALLA 3: el cliente ve % aceptaciones (debía ver solo la suya)', _n;
  end if;

  -- 4) Un usuario no puede escribir, cambiar ni borrar aceptaciones.
  begin
    insert into public.legal_acceptances (user_id, terminos_version, privacidad_version)
    values (_cliente, '2030-01-01', '2030-01-01');
    raise exception 'FALLA 4a: el usuario pudo insertar una aceptación';
  exception when insufficient_privilege then
    null;
  end;
  begin
    update public.legal_acceptances set terminos_version = '2030-01-01' where user_id = _cliente;
    raise exception 'FALLA 4b: el usuario pudo modificar su aceptación';
  exception when insufficient_privilege then
    null;
  end;
  begin
    delete from public.legal_acceptances where user_id = _cliente;
    raise exception 'FALLA 4c: el usuario pudo borrar su aceptación';
  exception when insufficient_privilege then
    null;
  end;
  reset role;

  -- 5) Anónimo no lee nada.
  set local role anon;
  begin
    select count(*) into _n from public.legal_acceptances;
    if _n > 0 then
      raise exception 'FALLA 5: anon lee % aceptaciones', _n;
    end if;
  exception when insufficient_privilege then
    null;
  end;
  reset role;

  -- 6) La función del trigger no se puede llamar por RPC.
  if has_function_privilege('authenticated', 'public.registrar_aceptacion_legal()', 'execute')
     or has_function_privilege('anon', 'public.registrar_aceptacion_legal()', 'execute') then
    raise exception 'FALLA 6: registrar_aceptacion_legal es ejecutable por clientes';
  end if;

  raise exception 'OK';
end
$$;
