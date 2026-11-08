-- =============================================================================
-- HND-003 · Red Handle: negocios afiliados, KYB, cuentas Pey, cobros CoDi,
-- clientes y ledger de puntos.
-- Ver docs/01-TDR.md §4. RLS se ACTIVA aquí; políticas en HND-004.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.tipo_persona       as enum ('fisica', 'moral');
create type public.categoria_negocio  as enum (
  'abarrotes', 'carniceria', 'taqueria', 'tortilleria', 'panaderia', 'fruteria', 'tienda', 'otro'
);
create type public.estado_kyb         as enum ('borrador', 'en_revision', 'aprobado', 'rechazado');
create type public.tipo_documento_kyb as enum ('ine', 'constancia_fiscal', 'comprobante_domicilio', 'titularidad_cuenta');
create type public.estado_documento   as enum ('pendiente', 'validado', 'rechazado');
create type public.decision_kyb       as enum ('aprobado', 'rechazado');
create type public.estado_cuenta_pey  as enum ('en_registro', 'activa', 'suspendida');
create type public.tipo_cobro         as enum ('qr', 'push');
create type public.estado_cobro       as enum ('pendiente', 'pagado', 'expirado', 'cancelado');
create type public.nivel_cliente      as enum ('nuevo', 'confianza', 'vip');
create type public.tipo_mov_puntos    as enum ('acumulacion', 'canje', 'ajuste', 'expiracion');

-- -----------------------------------------------------------------------------
-- Funciones de apoyo
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- Tablas hijas de un negocio: org_id SIEMPRE se deriva del negocio
-- (ignora lo que mande el cliente), así RLS por org_id es confiable.
create or replace function public.set_org_from_business()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  select org_id into new.org_id from public.businesses where id = new.business_id;
  if new.org_id is null then
    raise exception 'Negocio no encontrado' using errcode = 'foreign_key_violation';
  end if;
  return new;
end
$$;

-- Registros de auditoría / ledger: no se modifican ni se borran.
create or replace function public.prevent_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Registro inmutable en %: agrega un nuevo registro en lugar de modificarlo', tg_table_name
    using errcode = 'restrict_violation';
end
$$;

-- -----------------------------------------------------------------------------
-- Negocios afiliados (1 negocio por organización; multi-sucursal = ADR abierto)
-- -----------------------------------------------------------------------------
create table public.businesses (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null unique references public.organizations (id) on delete cascade,
  nombre_comercial text not null,
  razon_social     text,
  tipo_persona     public.tipo_persona not null default 'fisica',
  rfc              text check (rfc is null or rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),
  curp             text check (curp is null or curp ~ '^[A-Z]{4}[0-9]{6}[HMX][A-Z]{5}[A-Z0-9][0-9]$'),
  categoria        public.categoria_negocio not null default 'abarrotes',
  telefono         text,
  direccion        text,
  cp               text check (cp is null or cp ~ '^[0-9]{5}$'),
  lat              numeric(9, 6) check (lat between -90 and 90),
  lng              numeric(9, 6) check (lng between -180 and 180),
  estado_kyb       public.estado_kyb not null default 'borrador',
  recomendado      boolean not null default false,
  activo           boolean not null default false,
  horario          jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- Para salir de borrador el expediente debe tener los datos fiscales mínimos.
  constraint businesses_expediente_completo check (
    estado_kyb = 'borrador'
    or (razon_social is not null and rfc is not null and direccion is not null and cp is not null)
  ),
  -- Solo un negocio aprobado puede estar activo o recomendado.
  constraint businesses_activo_requiere_aprobacion check (not activo or estado_kyb = 'aprobado'),
  constraint businesses_recomendado_requiere_aprobacion check (not recomendado or estado_kyb = 'aprobado')
);
create index businesses_estado_kyb_idx on public.businesses (estado_kyb);
-- Consulta del mapa público: negocios aprobados y activos por categoría.
create index businesses_mapa_idx on public.businesses (categoria) where estado_kyb = 'aprobado' and activo;

create trigger tg_10_set_org_id before insert on public.businesses
  for each row execute function public.set_org_id();
create trigger tg_90_updated_at before update on public.businesses
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- KYB: documentos y bitácora de revisión
-- -----------------------------------------------------------------------------
create table public.kyb_documents (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  business_id  uuid not null references public.businesses (id) on delete cascade,
  tipo         public.tipo_documento_kyb not null,
  storage_path text not null,
  estado       public.estado_documento not null default 'pendiente',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (business_id, tipo)
);

create trigger tg_10_set_org before insert or update of business_id on public.kyb_documents
  for each row execute function public.set_org_from_business();
create trigger tg_90_updated_at before update on public.kyb_documents
  for each row execute function public.set_updated_at();

create table public.kyb_reviews (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  reviewer_id uuid not null references public.profiles (id),
  decision    public.decision_kyb not null,
  notas       text,
  created_at  timestamptz not null default now()
);
create index kyb_reviews_business_id_idx on public.kyb_reviews (business_id, created_at desc);

create trigger tg_10_set_org before insert on public.kyb_reviews
  for each row execute function public.set_org_from_business();
create trigger tg_00_inmutable before update or delete on public.kyb_reviews
  for each row execute function public.prevent_mutation();

-- -----------------------------------------------------------------------------
-- Cuenta de cobro CoDi en Pey (1 por negocio)
-- -----------------------------------------------------------------------------
create table public.pey_accounts (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations (id) on delete cascade,
  business_id         uuid not null unique references public.businesses (id) on delete cascade,
  pey_bank_account_id text unique,
  pey_api_key_ref     text,          -- referencia al secreto, NUNCA el secreto
  estado              public.estado_cuenta_pey not null default 'en_registro',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create trigger tg_10_set_org before insert or update of business_id on public.pey_accounts
  for each row execute function public.set_org_from_business();
create trigger tg_90_updated_at before update on public.pey_accounts
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Clientes finales (de toda la red, no pertenecen a una org)
-- -----------------------------------------------------------------------------
create table public.customers (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid unique references auth.users (id) on delete set null,
  email      text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  nombre     text,
  nivel      public.nivel_cliente not null default 'nuevo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index customers_email_unique on public.customers (lower(email));

create trigger tg_90_updated_at before update on public.customers
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Cobros CoDi
-- -----------------------------------------------------------------------------
create table public.charges (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  business_id      uuid not null references public.businesses (id) on delete restrict,
  cajero_id        uuid references public.profiles (id) on delete set null,
  customer_id      uuid references public.customers (id) on delete set null,
  monto            numeric(12, 2) not null check (monto > 0 and monto <= 1000000),
  descuento_puntos numeric(12, 2) not null default 0 check (descuento_puntos >= 0),
  tipo             public.tipo_cobro not null,
  pey_charge_id    text unique,
  estado           public.estado_cobro not null default 'pendiente',
  idempotency_key  text not null unique,
  paid_at          timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint charges_descuento_menor_al_monto check (descuento_puntos <= monto),
  constraint charges_pagado_con_fecha check (estado <> 'pagado' or paid_at is not null)
);
create index charges_business_created_idx on public.charges (business_id, created_at desc);
create index charges_estado_pendiente_idx on public.charges (estado) where estado = 'pendiente';
create index charges_customer_id_idx on public.charges (customer_id);

create trigger tg_10_set_org before insert or update of business_id on public.charges
  for each row execute function public.set_org_from_business();
create trigger tg_90_updated_at before update on public.charges
  for each row execute function public.set_updated_at();

-- Cada cobro pagado genera a lo más UN ingreso en finanzas (idempotencia).
alter table public.transactions
  add column charge_id uuid references public.charges (id) on delete set null;
create unique index transactions_charge_id_unique on public.transactions (charge_id) where charge_id is not null;

-- -----------------------------------------------------------------------------
-- Reglas de puntos (máximo una regla activa por negocio)
-- -----------------------------------------------------------------------------
create table public.point_rules (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.organizations (id) on delete cascade,
  business_id   uuid not null references public.businesses (id) on delete cascade,
  porcentaje    numeric(5, 2) not null check (porcentaje > 0 and porcentaje <= 100),
  tope_puntos   numeric(12, 2) check (tope_puntos > 0),
  vigencia_dias integer check (vigencia_dias > 0),
  activo        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index point_rules_una_activa on public.point_rules (business_id) where activo;

create trigger tg_10_set_org before insert or update of business_id on public.point_rules
  for each row execute function public.set_org_from_business();
create trigger tg_90_updated_at before update on public.point_rules
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Ledger de puntos: INMUTABLE. El saldo se deriva, nunca se edita.
-- v1: saldo por (cliente, negocio). Puntos interoperables = HND-101.
-- Los puntos son SOLO descuento; no son efectivo ni transferibles.
-- -----------------------------------------------------------------------------
create table public.point_transactions (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations (id) on delete cascade,
  customer_id      uuid not null references public.customers (id) on delete restrict,
  business_id      uuid not null references public.businesses (id) on delete restrict,
  charge_id        uuid references public.charges (id) on delete restrict,
  tipo             public.tipo_mov_puntos not null,
  puntos           numeric(12, 2) not null check (puntos <> 0),
  saldo_resultante numeric(12, 2) not null default 0,   -- lo calcula el trigger
  created_at       timestamptz not null default now(),
  constraint point_transactions_signo check (
    (tipo = 'acumulacion' and puntos > 0)
    or (tipo in ('canje', 'expiracion') and puntos < 0)
    or tipo = 'ajuste'
  )
);
create index point_transactions_saldo_idx on public.point_transactions (customer_id, business_id, created_at);
-- Un cobro acumula una sola vez y canjea una sola vez (idempotencia del webhook).
create unique index point_transactions_charge_tipo_unique
  on public.point_transactions (charge_id, tipo) where charge_id is not null;

-- Calcula saldo_resultante bajo bloqueo del cliente (sin carreras) y
-- rechaza cualquier movimiento que deje el saldo en negativo.
create or replace function public.point_tx_compute_saldo()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  _saldo numeric(12, 2);
begin
  perform 1 from public.customers where id = new.customer_id for update;

  select coalesce(sum(puntos), 0) into _saldo
    from public.point_transactions
   where customer_id = new.customer_id and business_id = new.business_id;

  new.saldo_resultante := _saldo + new.puntos;
  new.created_at := now();

  if new.saldo_resultante < 0 then
    raise exception 'Saldo de puntos insuficiente (saldo actual: %)', _saldo using errcode = 'check_violation';
  end if;
  return new;
end
$$;

create trigger tg_00_inmutable before update or delete on public.point_transactions
  for each row execute function public.prevent_mutation();
create trigger tg_10_set_org before insert on public.point_transactions
  for each row execute function public.set_org_from_business();
create trigger tg_20_saldo before insert on public.point_transactions
  for each row execute function public.point_tx_compute_saldo();

-- Saldo actual por cliente y negocio. security_invoker: respeta el RLS de quien consulta.
create view public.customer_point_balances
with (security_invoker = true) as
select
  customer_id,
  business_id,
  org_id,
  sum(puntos)::numeric(12, 2) as saldo,
  max(created_at)             as ultimo_movimiento
from public.point_transactions
group by customer_id, business_id, org_id;

-- -----------------------------------------------------------------------------
-- RLS activado en todo (sin políticas = sin acceso). Políticas en HND-004.
-- -----------------------------------------------------------------------------
alter table public.businesses         enable row level security;
alter table public.kyb_documents      enable row level security;
alter table public.kyb_reviews        enable row level security;
alter table public.pey_accounts       enable row level security;
alter table public.customers          enable row level security;
alter table public.charges            enable row level security;
alter table public.point_rules        enable row level security;
alter table public.point_transactions enable row level security;

-- Realtime: la pantalla de caja verá cuando un cobro pase a "pagado".
alter publication supabase_realtime add table public.charges;
