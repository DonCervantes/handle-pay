-- =============================================================================
-- Prueba de 20261108040201_seguridad_cobros_search_path.sql (T2)
--
-- Correr DESPUÉS de aplicar la migración, en el SQL editor de Supabase (como
-- postgres). Termina con raise exception 'OK': si ves "ERROR: OK" pasaron todos
-- los escenarios y NADA quedó escrito (la transacción se revierte).
-- =============================================================================
do $$
declare
  _org_a    uuid := gen_random_uuid();
  _org_b    uuid := gen_random_uuid();
  _neg_a    uuid;
  _neg_b    uuid;
  _cajero   uuid := gen_random_uuid();
  _cli_x    uuid;  -- cliente sin relación con el negocio A
  _cli_y    uuid;  -- cliente ligado a A por puntos
  _cli_z    uuid;  -- cliente ligado solo al negocio B
  _cobro    uuid;
  _cobro2   uuid;
  _n        int;
  _cfg      text[];
  _f        text;
begin
  -- 1) search_path vacío en las funciones de las políticas.
  foreach _f in array array['public.is_admin_red()', 'public.current_org_id()',
                            'public.has_role(text[])', 'public.my_customer_id()',
                            'public.asignar_cliente_cobro(uuid,uuid)',
                            'public.cliente_ligado_a_mi_org(uuid)'] loop
    select proconfig into _cfg from pg_proc where oid = _f::regprocedure;
    if not (_cfg @> array['search_path=""']) then
      raise exception 'FALLA 1: % tiene search_path %', _f, _cfg;
    end if;
  end loop;

  -- Datos: dos negocios, un cajero del A y tres clientes.
  insert into public.organizations (id, name) values
    (_org_a, 'E2E seguridad A'), (_org_b, 'E2E seguridad B');
  insert into public.businesses (org_id, nombre_comercial, categoria)
  values (_org_a, 'E2E Abarrotes A', 'abarrotes') returning id into _neg_a;
  insert into public.businesses (org_id, nombre_comercial, categoria)
  values (_org_b, 'E2E Abarrotes B', 'abarrotes') returning id into _neg_b;

  insert into auth.users (id, instance_id, aud, role, email, raw_app_meta_data, raw_user_meta_data)
  values (_cajero, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
          'cajero-t2@e2e.handle-prueba.mx', '{}', '{}');
  update public.profiles set org_id = _org_a, role = 'cajero' where id = _cajero;

  insert into public.customers (email) values ('x-t2@e2e.handle-prueba.mx') returning id into _cli_x;
  insert into public.customers (email) values ('y-t2@e2e.handle-prueba.mx') returning id into _cli_y;
  insert into public.customers (email) values ('z-t2@e2e.handle-prueba.mx') returning id into _cli_z;

  insert into public.point_transactions (org_id, customer_id, business_id, tipo, puntos)
  values (_org_a, _cli_y, _neg_a, 'ajuste', 10), (_org_b, _cli_z, _neg_b, 'ajuste', 10);

  perform set_config('request.jwt.claims',
    json_build_object('sub', _cajero, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- 2) Las funciones siguen respondiendo con search_path vacío.
  if public.current_org_id() is distinct from _org_a
     or not public.has_role(array['cajero']) or public.is_admin_red() then
    raise exception 'FALLA 2: helpers de RLS con resultado inesperado';
  end if;

  -- 3) La caja crea un cobro sin cliente.
  insert into public.charges (business_id, cajero_id, monto, tipo, idempotency_key)
  values (_neg_a, _cajero, 100, 'qr', 'e2e-t2-1') returning id into _cobro;

  -- 4) La caja NO puede ligar a un cliente ajeno (sin relación con su negocio).
  begin
    insert into public.charges (business_id, cajero_id, customer_id, monto, tipo, idempotency_key)
    values (_neg_a, _cajero, _cli_x, 100, 'qr', 'e2e-t2-2');
    raise exception 'FALLA 4: la caja ligó un cliente sin relación con su negocio';
  exception when insufficient_privilege then
    null;
  end;

  -- 5) Ni a un cliente que solo es de otro negocio.
  begin
    insert into public.charges (business_id, cajero_id, customer_id, monto, tipo, idempotency_key)
    values (_neg_a, _cajero, _cli_z, 100, 'qr', 'e2e-t2-3');
    raise exception 'FALLA 5: la caja ligó un cliente de otro negocio';
  exception when insufficient_privilege then
    null;
  end;

  -- 6) Sí puede usar a un cliente ya ligado por puntos.
  insert into public.charges (business_id, cajero_id, customer_id, monto, tipo, idempotency_key)
  values (_neg_a, _cajero, _cli_y, 100, 'qr', 'e2e-t2-4');

  -- 7) La caja no puede llamar asignar_cliente_cobro.
  begin
    perform public.asignar_cliente_cobro(_cobro, _cli_x);
    raise exception 'FALLA 7: authenticated ejecutó asignar_cliente_cobro';
  exception when insufficient_privilege then
    null;
  end;
  reset role;

  -- 8) El servidor liga al cliente nuevo; es idempotente y no lo reemplaza.
  perform public.asignar_cliente_cobro(_cobro, _cli_x);
  perform public.asignar_cliente_cobro(_cobro, _cli_x);
  if (select customer_id from public.charges where id = _cobro) is distinct from _cli_x then
    raise exception 'FALLA 8: el cobro no quedó ligado al cliente';
  end if;
  begin
    perform public.asignar_cliente_cobro(_cobro, _cli_y);
    raise exception 'FALLA 8b: se reemplazó el cliente de un cobro';
  exception when check_violation then
    null;
  end;

  -- 9) No se liga cliente a un cobro que ya no está pendiente.
  insert into public.charges (business_id, monto, tipo, idempotency_key)
  values (_neg_a, 50, 'qr', 'e2e-t2-5') returning id into _cobro2;
  update public.charges set estado = 'cancelado' where id = _cobro2;
  begin
    perform public.asignar_cliente_cobro(_cobro2, _cli_x);
    raise exception 'FALLA 9: se ligó cliente a un cobro cancelado';
  exception when check_violation then
    null;
  end;

  -- 10) Ya ligado por su primer cobro, la caja puede volver a usarlo directo.
  set local role authenticated;
  insert into public.charges (business_id, cajero_id, customer_id, monto, tipo, idempotency_key)
  values (_neg_a, _cajero, _cli_x, 100, 'qr', 'e2e-t2-6');
  select count(*) into _n from public.customers where id = _cli_x;
  if _n <> 1 then
    raise exception 'FALLA 10: la caja no ve al cliente ligado (%)', _n;
  end if;
  reset role;

  raise exception 'OK';
end
$$;
