-- =============================================================================
-- Fase 3 · Cobros CoDi con Pey
--   HND-031  Cuenta de cobro: datos visibles (sin guardar la CLABE completa)
--   HND-034  Bitácora de webhooks (idempotencia por webhook-id) y conciliación
--            atómica de un pago: cobro pagado + ingreso en finanzas
-- =============================================================================

-- Pey reporta ERROR cuando no pudo registrar la cuenta en CoDi.
alter type public.estado_cuenta_pey add value if not exists 'error';

-- Solo los últimos 4 dígitos de la CLABE: Pey guarda la completa; aquí basta para mostrarla.
alter table public.pey_accounts add column clabe_ultimos4 text check (clabe_ultimos4 ~ '^[0-9]{4}$');
alter table public.pey_accounts add column titular text;
alter table public.pey_accounts add column error_mensaje text;

-- -----------------------------------------------------------------------------
-- Webhooks recibidos de Pey. La llave es el encabezado webhook-id (Standard
-- Webhooks): si Pey reintenta la entrega, no se procesa dos veces.
-- Solo service_role (RLS sin políticas).
-- -----------------------------------------------------------------------------
create table public.pey_webhook_events (
  id           text primary key,
  tipo         text not null,
  payload      jsonb not null,
  recibido_at  timestamptz not null default now(),
  procesado_at timestamptz,
  resultado    text
);
alter table public.pey_webhook_events enable row level security;
revoke all on public.pey_webhook_events from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Registrar un pago confirmado por Pey, en una sola transacción:
--   1) el cobro pasa a "pagado" (aunque se hubiera cancelado o vencido: el dinero ya llegó)
--   2) se crea UN ingreso en finanzas ligado al cobro (índice único por charge_id)
-- Idempotente: si el cobro ya estaba pagado, no hace nada.
-- Solo la llama el servidor (webhook) con service_role.
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

  return 'pagado';
end
$$;

revoke execute on function public.registrar_pago_pey(uuid, numeric, timestamptz, text) from public, anon, authenticated;
