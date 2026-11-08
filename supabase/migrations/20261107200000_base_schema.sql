-- =============================================================================
-- HND-003 · Esquema base (reconstruido del repo original, SIN Stellar)
-- Tablas del ERP ligero: organizaciones, perfiles, finanzas, clientes,
-- colaboradores, proveedores, IA y API keys.
-- Eliminado respecto al original: org_wallets, finalize_payment() y las
-- columnas on-chain (stellar_address, asset_pref, amount_token, asset_code,
-- stellar_tx_hash).
-- RLS se ACTIVA en todas las tablas; las políticas se definen en HND-004.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Organizaciones y perfiles
-- -----------------------------------------------------------------------------
create table public.organizations (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  country          text not null default 'MX',
  currency_default text not null default 'MXN',
  created_at       timestamptz not null default now()
);

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  org_id     uuid not null references public.organizations (id) on delete cascade,
  -- owner = dueño del negocio. cajero / admin_red / cliente son roles de Handle.
  role       text not null default 'owner'
             check (role in ('owner', 'admin', 'finance', 'hr', 'sales', 'cajero', 'admin_red', 'cliente')),
  full_name  text,
  created_at timestamptz not null default now()
);
create index profiles_org_id_idx on public.profiles (org_id);

-- Org del usuario autenticado. Base de todas las políticas RLS (HND-004).
create or replace function public.current_org_id()
returns uuid
language sql stable security definer
set search_path = public
as $$
  select org_id from public.profiles where id = auth.uid()
$$;

-- BEFORE INSERT: si el cliente omite org_id, se toma la del usuario.
create or replace function public.set_org_id()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.org_id is null then
    new.org_id := public.current_org_id();
  end if;
  return new;
end
$$;

-- -----------------------------------------------------------------------------
-- Finanzas
-- -----------------------------------------------------------------------------
create table public.accounts (
  id      uuid primary key default gen_random_uuid(),
  org_id  uuid references public.organizations (id) on delete cascade,
  name    text not null,
  type    text not null default 'banco',
  balance numeric(14, 2) not null default 0
);
create index accounts_org_id_idx on public.accounts (org_id);

-- -----------------------------------------------------------------------------
-- CRM
-- -----------------------------------------------------------------------------
create table public.clients (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid references public.organizations (id) on delete cascade,
  name        text not null,
  email       text,
  phone       text,
  status      text not null default 'activo',
  balance_due numeric(14, 2) not null default 0,
  created_at  timestamptz not null default now()
);
create index clients_org_id_idx on public.clients (org_id);

create table public.client_contacts (
  id        uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  name      text not null,
  email     text,
  phone     text,
  role      text
);
create index client_contacts_client_id_idx on public.client_contacts (client_id);

-- -----------------------------------------------------------------------------
-- Colaboradores
-- -----------------------------------------------------------------------------
create table public.employees (
  id        uuid primary key default gen_random_uuid(),
  org_id    uuid references public.organizations (id) on delete cascade,
  full_name text not null,
  position  text,
  salary    numeric(14, 2) not null default 0,
  hire_date date not null default current_date,
  status    text not null default 'activo'
);
create index employees_org_id_idx on public.employees (org_id);

create table public.leave_requests (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  start_date  date not null,
  end_date    date not null,
  type        text not null default 'vacaciones',
  status      text not null default 'pendiente',
  check (end_date >= start_date)
);
create index leave_requests_employee_id_idx on public.leave_requests (employee_id);

-- -----------------------------------------------------------------------------
-- Proveedores y pagos a proveedores (registro genérico, sin liquidación on-chain)
-- -----------------------------------------------------------------------------
create table public.suppliers (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid references public.organizations (id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);
create index suppliers_org_id_idx on public.suppliers (org_id);

create table public.payments (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid references public.organizations (id) on delete cascade,
  supplier_id   uuid not null references public.suppliers (id) on delete restrict,
  amount_fiat   numeric(14, 2) not null check (amount_fiat > 0),
  currency_fiat text not null default 'MXN',
  status        text not null default 'draft'
                check (status in ('draft', 'submitted', 'confirmed', 'failed')),
  error_message text,
  submitted_at  timestamptz,
  confirmed_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index payments_org_id_idx on public.payments (org_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Movimientos (ingresos / egresos)
-- -----------------------------------------------------------------------------
create table public.transactions (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid references public.organizations (id) on delete cascade,
  account_id  uuid references public.accounts (id) on delete set null,
  client_id   uuid references public.clients (id) on delete set null,
  supplier_id uuid references public.suppliers (id) on delete set null,
  payment_id  uuid references public.payments (id) on delete set null,
  type        text not null check (type in ('income', 'expense')),
  amount      numeric(14, 2) not null check (amount > 0),
  currency    text not null default 'MXN',
  category    text not null default 'General',
  description text,
  occurred_at timestamptz not null default now()
);
create index transactions_org_id_idx on public.transactions (org_id, occurred_at desc);
create index transactions_account_id_idx on public.transactions (account_id);
create index transactions_client_id_idx on public.transactions (client_id);

-- Las referencias de un movimiento deben pertenecer a la MISMA organización.
-- Evita que alguien ligue (y altere el saldo de) una cuenta de otra org.
create or replace function public.validate_transaction_refs()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.account_id is not null and not exists (
    select 1 from public.accounts where id = new.account_id and org_id is not distinct from new.org_id
  ) then
    raise exception 'La cuenta no pertenece a la organización' using errcode = 'foreign_key_violation';
  end if;
  if new.client_id is not null and not exists (
    select 1 from public.clients where id = new.client_id and org_id is not distinct from new.org_id
  ) then
    raise exception 'El cliente no pertenece a la organización' using errcode = 'foreign_key_violation';
  end if;
  if new.supplier_id is not null and not exists (
    select 1 from public.suppliers where id = new.supplier_id and org_id is not distinct from new.org_id
  ) then
    raise exception 'El proveedor no pertenece a la organización' using errcode = 'foreign_key_violation';
  end if;
  if new.payment_id is not null and not exists (
    select 1 from public.payments where id = new.payment_id and org_id is not distinct from new.org_id
  ) then
    raise exception 'El pago no pertenece a la organización' using errcode = 'foreign_key_violation';
  end if;
  return new;
end
$$;

create or replace function public.validate_payment_refs()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.suppliers where id = new.supplier_id and org_id is not distinct from new.org_id
  ) then
    raise exception 'El proveedor no pertenece a la organización' using errcode = 'foreign_key_violation';
  end if;
  return new;
end
$$;

-- El saldo de cada cuenta lo mantiene la base: ingreso suma, egreso resta.
create or replace function public.sync_account_balance()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.account_id is not null then
    update public.accounts
       set balance = balance - (case when old.type = 'income' then old.amount else -old.amount end)
     where id = old.account_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.account_id is not null then
    update public.accounts
       set balance = balance + (case when new.type = 'income' then new.amount else -new.amount end)
     where id = new.account_id;
  end if;
  return null;
end
$$;

-- -----------------------------------------------------------------------------
-- IA y API pública
-- -----------------------------------------------------------------------------
create table public.agent_runs (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid references public.organizations (id) on delete cascade,
  agent      text not null,
  input      jsonb,
  output     jsonb,
  tokens     integer,
  latency_ms integer,
  created_at timestamptz not null default now()
);
create index agent_runs_org_id_idx on public.agent_runs (org_id, created_at desc);

create table public.api_keys (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations (id) on delete cascade,
  name         text not null,
  key_hash     text not null unique,
  key_prefix   text not null,
  last_used_at timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index api_keys_org_id_idx on public.api_keys (org_id);

-- -----------------------------------------------------------------------------
-- Triggers (se ejecutan en orden alfabético: tg_10 antes que tg_20)
-- -----------------------------------------------------------------------------
create trigger tg_10_set_org_id before insert on public.accounts     for each row execute function public.set_org_id();
create trigger tg_10_set_org_id before insert on public.clients      for each row execute function public.set_org_id();
create trigger tg_10_set_org_id before insert on public.employees    for each row execute function public.set_org_id();
create trigger tg_10_set_org_id before insert on public.suppliers    for each row execute function public.set_org_id();
create trigger tg_10_set_org_id before insert on public.payments     for each row execute function public.set_org_id();
create trigger tg_10_set_org_id before insert on public.transactions for each row execute function public.set_org_id();
create trigger tg_10_set_org_id before insert on public.agent_runs   for each row execute function public.set_org_id();
create trigger tg_10_set_org_id before insert on public.api_keys     for each row execute function public.set_org_id();

create trigger tg_20_validate_refs before insert or update on public.transactions
  for each row execute function public.validate_transaction_refs();
create trigger tg_20_validate_refs before insert or update on public.payments
  for each row execute function public.validate_payment_refs();

create trigger tg_30_sync_balance after insert or update or delete on public.transactions
  for each row execute function public.sync_account_balance();

-- -----------------------------------------------------------------------------
-- Alta de usuario: crea organización + perfil owner + configuración inicial
-- -----------------------------------------------------------------------------
-- Configuración inicial de una org nueva (cuentas por defecto).
-- Conserva el nombre seed_demo_data por compatibilidad con el repo original.
create or replace function public.seed_demo_data(_org uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  insert into public.accounts (org_id, name, type) values
    (_org, 'Caja', 'efectivo'),
    (_org, 'Cuenta CoDi', 'banco');
end
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  _org uuid;
begin
  insert into public.organizations (name)
  values (coalesce(nullif(trim(new.raw_user_meta_data ->> 'org_name'), ''), 'Mi negocio'))
  returning id into _org;

  -- El rol NUNCA se toma de los metadatos del registro (evita escalar privilegios).
  insert into public.profiles (id, org_id, role, full_name)
  values (new.id, _org, 'owner', nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''));

  perform public.seed_demo_data(_org);
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Funciones internas: no invocables por RPC desde el cliente.
revoke execute on function public.seed_demo_data(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- RLS activado en todo (sin políticas = sin acceso). Políticas en HND-004.
-- -----------------------------------------------------------------------------
alter table public.organizations   enable row level security;
alter table public.profiles        enable row level security;
alter table public.accounts        enable row level security;
alter table public.clients         enable row level security;
alter table public.client_contacts enable row level security;
alter table public.employees       enable row level security;
alter table public.leave_requests  enable row level security;
alter table public.suppliers       enable row level security;
alter table public.payments        enable row level security;
alter table public.transactions    enable row level security;
alter table public.agent_runs      enable row level security;
alter table public.api_keys        enable row level security;

-- Realtime: el layout de la app escucha cambios en estas tablas.
alter publication supabase_realtime add table public.payments, public.transactions, public.accounts;
