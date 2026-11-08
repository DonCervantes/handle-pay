-- =============================================================================
-- Fase 4 · Lealtad y puntos
--   HND-040  Reglas de puntos por negocio (porcentaje, tope, vigencia, canje máximo)
--   HND-041  Acumular puntos al pagarse un cobro
--   HND-042  Cliente identificado por correo en la caja
--   HND-043  Canje de puntos como descuento (reserva al cobrar, devolución si no se paga)
--   HND-045  Niveles nuevo / confianza / vip según compras pagadas en la red
--
-- Reglas del programa:
--   * 1 punto = $1 MXN de descuento, solo en el negocio donde se ganó.
--     Los puntos NO son dinero: no se retiran ni se transfieren.
--   * Se gana sobre lo que el cliente pagó (monto − descuento), multiplicado por su nivel.
--   * Vigencia por inactividad: si el cliente no tiene movimientos en ese negocio en
--     `vigencia_dias`, su saldo ahí vence.
--   * Todo lo escribe el servidor (service_role). El cliente y la caja solo leen.
-- =============================================================================

-- Tope de canje por compra (porcentaje del total). Siempre queda algo por pagar.
alter table public.point_rules
  add column canje_max_porcentaje numeric(5, 2) not null default 50
    check (canje_max_porcentaje > 0 and canje_max_porcentaje <= 90);

comment on column public.point_rules.porcentaje is 'Puntos ganados por cada $100 pagados (1 punto = $1).';
comment on column public.point_rules.tope_puntos is 'Máximo de puntos que se ganan en una sola compra.';
comment on column public.point_rules.vigencia_dias is 'Los puntos vencen tras estos días sin movimientos en el negocio.';
comment on column public.point_rules.canje_max_porcentaje is 'Porcentaje máximo de una compra que se puede pagar con puntos.';

-- Un cobro acumula una vez y canjea una vez. Los ajustes (devolver un canje de un
-- cobro no pagado, o volverlo a cobrar si el pago llega tarde) pueden repetirse.
drop index public.point_transactions_charge_tipo_unique;
create unique index point_transactions_charge_tipo_unique
  on public.point_transactions (charge_id, tipo)
  where charge_id is not null and tipo in ('acumulacion', 'canje');

-- Con descuento, siempre queda algo que pagar por CoDi.
alter table public.charges drop constraint charges_descuento_menor_al_monto;
alter table public.charges
  add constraint charges_descuento_menor_al_monto check (descuento_puntos = 0 or descuento_puntos < monto);

-- -----------------------------------------------------------------------------
-- Niveles (HND-045)
-- -----------------------------------------------------------------------------
create or replace function public.multiplicador_nivel(_nivel public.nivel_cliente)
returns numeric
language sql immutable
set search_path = public
as $$
  select case _nivel when 'vip' then 1.5 when 'confianza' then 1.25 else 1 end::numeric
$$;

create or replace function public.nivel_por_compras(_compras bigint)
returns public.nivel_cliente
language sql immutable
set search_path = public
as $$
  select case
    when _compras >= 20 then 'vip'
    when _compras >= 5  then 'confianza'
    else 'nuevo'
  end::public.nivel_cliente
$$;

-- -----------------------------------------------------------------------------
-- Vencimiento por inactividad. Devuelve los puntos que vencieron.
-- -----------------------------------------------------------------------------
create or replace function public.expirar_puntos_inactivos(_customer_id uuid, _business_id uuid)
returns numeric
language plpgsql security definer
set search_path = public
as $$
declare
  _dias   integer;
  _saldo  numeric(12, 2);
  _ultimo timestamptz;
begin
  select vigencia_dias into _dias
    from public.point_rules where business_id = _business_id and activo;
  if _dias is null then
    return 0;
  end if;

  perform 1 from public.customers where id = _customer_id for update;
  select coalesce(sum(puntos), 0), max(created_at) into _saldo, _ultimo
    from public.point_transactions
   where customer_id = _customer_id and business_id = _business_id;

  if _saldo > 0 and _ultimo < now() - make_interval(days => _dias) then
    insert into public.point_transactions (customer_id, business_id, tipo, puntos)
    values (_customer_id, _business_id, 'expiracion', -_saldo);
    return _saldo;
  end if;
  return 0;
end
$$;

-- -----------------------------------------------------------------------------
-- Cliente por correo (HND-042): lo encuentra o lo crea, sin cuenta todavía.
-- Cuando esa persona se registre como cliente, handle_new_user liga su ficha.
-- -----------------------------------------------------------------------------
create or replace function public.cliente_por_email(_email text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  _id uuid;
  _correo text := lower(trim(_email));
begin
  insert into public.customers (email) values (_correo)
  on conflict ((lower(email))) do nothing;
  select id into _id from public.customers where lower(email) = _correo;
  return _id;
end
$$;

-- -----------------------------------------------------------------------------
-- Canje (HND-043): reserva los puntos al crear el cobro. Devuelve lo que se cobra.
-- -----------------------------------------------------------------------------
create or replace function public.aplicar_canje(_charge_id uuid, _puntos numeric)
returns numeric
language plpgsql security definer
set search_path = public
as $$
declare
  _cobro  public.charges%rowtype;
  _regla  public.point_rules%rowtype;
  _maximo numeric(12, 2);
begin
  select * into _cobro from public.charges where id = _charge_id for update;
  if not found then
    raise exception 'Cobro % no encontrado', _charge_id using errcode = 'no_data_found';
  end if;
  if _cobro.estado <> 'pendiente' or _cobro.descuento_puntos > 0 then
    raise exception 'Este cobro ya no admite canje de puntos' using errcode = 'check_violation';
  end if;
  if _cobro.customer_id is null then
    raise exception 'Para usar puntos identifica primero al cliente' using errcode = 'check_violation';
  end if;
  if _puntos is null or _puntos <= 0 or _puntos <> round(_puntos, 2) then
    raise exception 'Puntos a canjear inválidos' using errcode = 'check_violation';
  end if;

  select * into _regla from public.point_rules where business_id = _cobro.business_id and activo;
  if not found then
    raise exception 'Este negocio no tiene un programa de puntos activo' using errcode = 'check_violation';
  end if;

  _maximo := trunc(_cobro.monto * _regla.canje_max_porcentaje / 100, 2);
  if _puntos > _maximo then
    raise exception 'En esta compra puedes usar máximo % puntos', _maximo using errcode = 'check_violation';
  end if;

  perform public.expirar_puntos_inactivos(_cobro.customer_id, _cobro.business_id);

  -- El trigger del ledger rechaza el movimiento si el saldo no alcanza.
  insert into public.point_transactions (customer_id, business_id, charge_id, tipo, puntos)
  values (_cobro.customer_id, _cobro.business_id, _charge_id, 'canje', -_puntos);

  update public.charges set descuento_puntos = _puntos where id = _charge_id;
  return _cobro.monto - _puntos;
end
$$;

-- Puntos de un cobro que siguen reservados (canje menos devoluciones). Interno.
create or replace function public.puntos_reservados(_charge_id uuid)
returns numeric
language sql stable
set search_path = public
as $$
  select coalesce(-sum(puntos), 0)::numeric(12, 2)
    from public.point_transactions
   where charge_id = _charge_id and tipo in ('canje', 'ajuste')
$$;

-- -----------------------------------------------------------------------------
-- Cerrar un cobro que no se pagó (cancelado o vencido) y devolver sus puntos.
-- Idempotente: si ya no está pendiente, solo regresa su estado.
-- -----------------------------------------------------------------------------
create or replace function public.cerrar_cobro(_charge_id uuid, _estado public.estado_cobro)
returns public.estado_cobro
language plpgsql security definer
set search_path = public
as $$
declare
  _cobro     public.charges%rowtype;
  _reservado numeric(12, 2);
begin
  if _estado not in ('cancelado', 'expirado') then
    raise exception 'Un cobro solo se cierra como cancelado o expirado' using errcode = 'check_violation';
  end if;
  select * into _cobro from public.charges where id = _charge_id for update;
  if not found then
    raise exception 'Cobro % no encontrado', _charge_id using errcode = 'no_data_found';
  end if;
  if _cobro.estado <> 'pendiente' then
    return _cobro.estado;
  end if;

  update public.charges set estado = _estado where id = _charge_id;

  _reservado := public.puntos_reservados(_charge_id);
  if _reservado > 0 then
    insert into public.point_transactions (customer_id, business_id, charge_id, tipo, puntos)
    values (_cobro.customer_id, _cobro.business_id, _charge_id, 'ajuste', _reservado);
  end if;
  return _estado;
end
$$;

-- Vence los cobros pendientes que ya pasaron su vigencia (10 min) más 5 de margen.
-- _business_id null = todos (para un job programado, HND-116).
create or replace function public.vencer_cobros_pendientes(_business_id uuid default null)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare
  _id uuid;
  _n  integer := 0;
begin
  for _id in
    select id from public.charges
     where estado = 'pendiente'
       and created_at < now() - interval '15 minutes'
       and (_business_id is null or business_id = _business_id)
  loop
    perform public.cerrar_cobro(_id, 'expirado');
    _n := _n + 1;
  end loop;
  return _n;
end
$$;

-- -----------------------------------------------------------------------------
-- Registrar un pago confirmado por Pey (reemplaza la versión de Fase 3), ahora con:
--   * si el cobro se había cerrado y sus puntos se devolvieron, se vuelven a cobrar
--     (si el cliente ya los gastó, el negocio absorbe ese descuento)
--   * acumulación de puntos (HND-041) y subida de nivel (HND-045)
-- -----------------------------------------------------------------------------
create or replace function public.registrar_pago_pey(
  _charge_id      uuid,
  _monto          numeric,
  _fecha_pago     timestamptz,
  _pey_referencia text
)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  _cobro   public.charges%rowtype;
  _cuenta  uuid;
  _negocio text;
  _regla   public.point_rules%rowtype;
  _nivel   public.nivel_cliente;
  _compras bigint;
  _puntos  numeric(12, 2);
begin
  select * into _cobro from public.charges where id = _charge_id for update;
  if not found then
    raise exception 'Cobro % no encontrado', _charge_id using errcode = 'no_data_found';
  end if;
  if _cobro.estado = 'pagado' then
    return 'ya_pagado';
  end if;

  -- Lo que se le cobró al cliente es el monto menos el descuento por puntos.
  if abs(_monto - (_cobro.monto - _cobro.descuento_puntos)) > 0.009 then
    raise exception 'El monto pagado (%) no coincide con el cobro (%)', _monto, _cobro.monto - _cobro.descuento_puntos
      using errcode = 'check_violation';
  end if;

  update public.charges
     set estado = 'pagado',
         paid_at = coalesce(_fecha_pago, now()),
         pey_charge_id = coalesce(pey_charge_id, _pey_referencia)
   where id = _charge_id;

  select a.id into _cuenta
    from public.accounts a
   where a.org_id = _cobro.org_id and a.name = 'Cuenta CoDi'
   order by a.id
   limit 1;
  select b.nombre_comercial into _negocio from public.businesses b where b.id = _cobro.business_id;

  insert into public.transactions (org_id, account_id, type, amount, category, description, occurred_at, charge_id)
  values (_cobro.org_id, _cuenta, 'income', _monto, 'Ventas',
          'Cobro CoDi · ' || coalesce(_negocio, 'Handle'), coalesce(_fecha_pago, now()), _charge_id)
  on conflict (charge_id) where charge_id is not null do nothing;

  if _cobro.customer_id is null then
    return 'pagado';
  end if;

  -- Pago tardío de un cobro cerrado: los puntos que se le devolvieron se vuelven a usar.
  if _cobro.descuento_puntos > 0 and public.puntos_reservados(_charge_id) < _cobro.descuento_puntos then
    begin
      insert into public.point_transactions (customer_id, business_id, charge_id, tipo, puntos)
      values (_cobro.customer_id, _cobro.business_id, _charge_id, 'ajuste',
              -(_cobro.descuento_puntos - public.puntos_reservados(_charge_id)));
    exception when check_violation then
      null;  -- ya no le alcanzan: el negocio absorbe el descuento
    end;
  end if;

  -- Nivel según compras pagadas en toda la red (nunca baja).
  select count(*) into _compras
    from public.charges where customer_id = _cobro.customer_id and estado = 'pagado';
  update public.customers
     set nivel = greatest(nivel, public.nivel_por_compras(_compras))
   where id = _cobro.customer_id
  returning nivel into _nivel;

  -- Acumulación según la regla activa del negocio.
  select * into _regla from public.point_rules where business_id = _cobro.business_id and activo;
  if found then
    perform public.expirar_puntos_inactivos(_cobro.customer_id, _cobro.business_id);
    _puntos := round(_monto * _regla.porcentaje / 100 * public.multiplicador_nivel(_nivel), 2);
    if _regla.tope_puntos is not null then
      _puntos := least(_puntos, _regla.tope_puntos);
    end if;
    if _puntos >= 0.01 then
      insert into public.point_transactions (customer_id, business_id, charge_id, tipo, puntos)
      values (_cobro.customer_id, _cobro.business_id, _charge_id, 'acumulacion', _puntos)
      on conflict (charge_id, tipo) where charge_id is not null and tipo in ('acumulacion', 'canje')
      do nothing;
    end if;
  end if;

  return 'pagado';
end
$$;

-- Solo el servidor (service_role).
revoke execute on function public.registrar_pago_pey(uuid, numeric, timestamptz, text) from public, anon, authenticated;
revoke execute on function public.multiplicador_nivel(public.nivel_cliente)          from public, anon, authenticated;
revoke execute on function public.nivel_por_compras(bigint)                           from public, anon, authenticated;
revoke execute on function public.expirar_puntos_inactivos(uuid, uuid)                from public, anon, authenticated;
revoke execute on function public.cliente_por_email(text)                             from public, anon, authenticated;
revoke execute on function public.aplicar_canje(uuid, numeric)                        from public, anon, authenticated;
revoke execute on function public.puntos_reservados(uuid)                             from public, anon, authenticated;
revoke execute on function public.cerrar_cobro(uuid, public.estado_cobro)             from public, anon, authenticated;
revoke execute on function public.vencer_cobros_pendientes(uuid)                      from public, anon, authenticated;
grant  execute on function public.registrar_pago_pey(uuid, numeric, timestamptz, text) to service_role;
grant  execute on function public.expirar_puntos_inactivos(uuid, uuid)                to service_role;
grant  execute on function public.cliente_por_email(text)                             to service_role;
grant  execute on function public.aplicar_canje(uuid, numeric)                        to service_role;
grant  execute on function public.cerrar_cobro(uuid, public.estado_cobro)             to service_role;
grant  execute on function public.vencer_cobros_pendientes(uuid)                      to service_role;
