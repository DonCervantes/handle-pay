
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null default 'MX',
  currency_default text not null default 'MXN',
  created_at timestamptz not null default now()
);
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  full_name text,
  role text not null default 'owner' check (role in ('owner','admin','finance','hr','sales')),
  created_at timestamptz not null default now()
);
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, email text, phone text,
  status text not null default 'activo' check (status in ('activo','prospecto','inactivo')),
  balance_due numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);
create table public.client_contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null, email text, phone text, role text
);
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null, position text,
  salary numeric(14,2) not null default 0,
  hire_date date not null default current_date,
  status text not null default 'activo' check (status in ('activo','vacaciones','baja'))
);
create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  type text not null default 'vacaciones',
  start_date date not null, end_date date not null,
  status text not null default 'pendiente' check (status in ('pendiente','aprobada','rechazada'))
);
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  type text not null default 'banco' check (type in ('caja','banco','wallet')),
  balance numeric(14,2) not null default 0
);
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null, stellar_address text, asset_pref text default 'USDC',
  created_at timestamptz not null default now()
);
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  supplier_id uuid not null references public.suppliers(id) on delete restrict,
  amount_fiat numeric(14,2) not null,
  currency_fiat text not null default 'MXN',
  amount_token numeric(20,7), asset_code text, stellar_tx_hash text,
  status text not null default 'draft' check (status in ('draft','signed','submitted','confirmed','failed')),
  created_at timestamptz not null default now()
);
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  account_id uuid references public.accounts(id) on delete set null,
  type text not null check (type in ('income','expense')),
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null default 'MXN',
  category text not null default 'General',
  description text,
  client_id uuid references public.clients(id) on delete set null,
  supplier_id uuid references public.suppliers(id) on delete set null,
  payment_id uuid references public.payments(id) on delete set null,
  occurred_at timestamptz not null default now()
);
create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  agent text not null, input jsonb, output jsonb, tokens int, latency_ms int,
  created_at timestamptz not null default now()
);

-- grants
grant select, update on public.organizations to authenticated;
grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
grant select, insert, update, delete on public.clients, public.client_contacts, public.employees, public.leave_requests, public.accounts, public.suppliers, public.payments, public.transactions to authenticated;
grant select, insert on public.agent_runs to authenticated;
grant all on public.organizations, public.profiles, public.clients, public.client_contacts, public.employees, public.leave_requests, public.accounts, public.suppliers, public.payments, public.transactions, public.agent_runs to service_role;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.client_contacts enable row level security;
alter table public.employees enable row level security;
alter table public.leave_requests enable row level security;
alter table public.accounts enable row level security;
alter table public.suppliers enable row level security;
alter table public.payments enable row level security;
alter table public.transactions enable row level security;
alter table public.agent_runs enable row level security;

create or replace function public.current_org_id()
returns uuid language sql stable security definer set search_path = public
as $$ select org_id from public.profiles where id = auth.uid() $$;

create policy "org read" on public.organizations for select to authenticated using (id = public.current_org_id());
create policy "org update" on public.organizations for update to authenticated using (id = public.current_org_id()) with check (id = public.current_org_id());
create policy "profiles read" on public.profiles for select to authenticated using (org_id = public.current_org_id());
create policy "profiles update own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "org all" on public.clients for all to authenticated using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());
create policy "org all" on public.employees for all to authenticated using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());
create policy "org all" on public.accounts for all to authenticated using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());
create policy "org all" on public.suppliers for all to authenticated using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());
create policy "org all" on public.payments for all to authenticated using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());
create policy "org all" on public.transactions for all to authenticated using (org_id = public.current_org_id()) with check (org_id = public.current_org_id());
create policy "org read" on public.agent_runs for select to authenticated using (org_id = public.current_org_id());
create policy "org insert" on public.agent_runs for insert to authenticated with check (org_id = public.current_org_id());
create policy "org all" on public.client_contacts for all to authenticated
  using (exists (select 1 from public.clients c where c.id = client_id and c.org_id = public.current_org_id()))
  with check (exists (select 1 from public.clients c where c.id = client_id and c.org_id = public.current_org_id()));
create policy "org all" on public.leave_requests for all to authenticated
  using (exists (select 1 from public.employees e where e.id = employee_id and e.org_id = public.current_org_id()))
  with check (exists (select 1 from public.employees e where e.id = employee_id and e.org_id = public.current_org_id()));

-- default org_id on insert
create or replace function public.set_org_id()
returns trigger language plpgsql security definer set search_path = public
as $$ begin
  if new.org_id is null then new.org_id := public.current_org_id(); end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['clients','employees','accounts','suppliers','payments','transactions','agent_runs'] loop
    execute format('alter table public.%I alter column org_id drop not null', t);
    execute format('create trigger set_org_id before insert on public.%I for each row execute function public.set_org_id()', t);
  end loop;
end $$;

-- demo seed
create or replace function public.seed_demo_data(_org uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare
  a_bank uuid; a_cash uuid; a_wallet uuid;
  c1 uuid; c2 uuid; c3 uuid; c4 uuid; c5 uuid;
  s1 uuid; s2 uuid; s3 uuid; s4 uuid;
  e1 uuid; e2 uuid;
  p1 uuid;
begin
  insert into accounts(org_id,name,type,balance) values (_org,'BBVA Empresarial','banco',284350.00) returning id into a_bank;
  insert into accounts(org_id,name,type,balance) values (_org,'Caja chica','caja',8200.00) returning id into a_cash;
  insert into accounts(org_id,name,type,balance) values (_org,'Wallet Stellar','wallet',45120.50) returning id into a_wallet;

  insert into clients(org_id,name,email,phone,status,balance_due) values (_org,'Comercializadora del Bajío','compras@cbajio.mx','+52 477 123 4567','activo',48500) returning id into c1;
  insert into clients(org_id,name,email,phone,status,balance_due) values (_org,'Grupo Textil Oaxaca','admin@textiloax.mx','+52 951 234 5678','activo',12800) returning id into c2;
  insert into clients(org_id,name,email,phone,status,balance_due) values (_org,'Café Altura Chiapas','hola@cafealtura.mx','+52 961 345 6789','prospecto',0) returning id into c3;
  insert into clients(org_id,name,email,phone,status,balance_due) values (_org,'Ferretería La Esperanza','ventas@laesperanza.mx','+52 33 4567 8901','activo',23150) returning id into c4;
  insert into clients(org_id,name,email,phone,status,balance_due) values (_org,'Distribuidora Norteña','pagos@dnortena.mx','+52 81 5678 9012','inactivo',0) returning id into c5;

  insert into client_contacts(client_id,name,email,phone,role) values
    (c1,'Laura Méndez','laura@cbajio.mx','+52 477 111 2233','Compras'),
    (c1,'Jorge Ramírez','jorge@cbajio.mx','+52 477 222 3344','Finanzas'),
    (c2,'Sofía Hernández','sofia@textiloax.mx','+52 951 333 4455','Dirección'),
    (c3,'Miguel Ángel Ruiz','miguel@cafealtura.mx','+52 961 444 5566','Fundador'),
    (c4,'Patricia López','paty@laesperanza.mx','+52 33 5555 6677','Administración'),
    (c5,'Ricardo Garza','rgarza@dnortena.mx','+52 81 6666 7788','Cuentas por pagar');

  insert into suppliers(org_id,name,stellar_address,asset_pref) values (_org,'Empaques Industriales GDL','GBXK4QZ7RJ2M5VH3NWPLA6TQY8CDFE2S9UGKJ4MNRX7PZW3LHBQ5TYCV','USDC') returning id into s1;
  insert into suppliers(org_id,name,stellar_address,asset_pref) values (_org,'Logística Express MX',null,'USDC') returning id into s2;
  insert into suppliers(org_id,name,stellar_address,asset_pref) values (_org,'Software Contable Pro','GCQ7MZP2LKX4WN8RTYV5HJ3FBDE6SA9UGQK2NMPLX4RZ7WTH5CJYVB3D','CETES') returning id into s3;
  insert into suppliers(org_id,name,stellar_address,asset_pref) values (_org,'Materias Primas del Sur',null,'USDC') returning id into s4;

  insert into payments(org_id,supplier_id,amount_fiat,currency_fiat,asset_code,status,created_at) values (_org,s1,35000,'MXN','USDC','confirmed',now()-interval '40 days') returning id into p1;
  insert into payments(org_id,supplier_id,amount_fiat,currency_fiat,asset_code,status,created_at) values
    (_org,s3,4999,'MXN','CETES','submitted',now()-interval '6 days'),
    (_org,s2,12400,'MXN','USDC','draft',now()-interval '1 day');

  insert into employees(org_id,full_name,position,salary,hire_date,status) values
    (_org,'Ana García Torres','Directora de Operaciones',65000,'2021-03-15','activo'),
    (_org,'Carlos Mendoza Ruiz','Contador',38000,'2022-01-10','activo'),
    (_org,'Valeria Sánchez Ortiz','Ejecutiva de Ventas',28000,'2023-06-01','vacaciones'),
    (_org,'Luis Fernando Castro','Almacenista',16500,'2023-09-18','activo'),
    (_org,'Mariana Flores Díaz','Coordinadora de RH',32000,'2022-11-07','activo'),
    (_org,'Diego Herrera Vega','Desarrollador',45000,'2024-02-12','activo');
  select id into e1 from employees where org_id=_org and full_name='Valeria Sánchez Ortiz';
  insert into leave_requests(employee_id,type,start_date,end_date,status) values (e1,'vacaciones',current_date-2,current_date+5,'aprobada');

  insert into transactions(org_id,account_id,type,amount,category,description,client_id,supplier_id,payment_id,occurred_at) values
    (_org,a_bank,'income',58000,'Ventas','Factura A-1021',c1,null,null,now()-interval '85 days'),
    (_org,a_bank,'expense',42000,'Nómina','Nómina 1a quincena',null,null,null,now()-interval '80 days'),
    (_org,a_bank,'income',23500,'Ventas','Factura A-1022',c2,null,null,now()-interval '76 days'),
    (_org,a_cash,'expense',3200,'Operación','Papelería y limpieza',null,null,null,now()-interval '72 days'),
    (_org,a_bank,'expense',18500,'Renta','Renta oficina',null,null,null,now()-interval '68 days'),
    (_org,a_bank,'income',41200,'Servicios','Consultoría logística',c4,null,null,now()-interval '63 days'),
    (_org,a_bank,'expense',42000,'Nómina','Nómina 2a quincena',null,null,null,now()-interval '60 days'),
    (_org,a_bank,'income',67300,'Ventas','Factura A-1030',c1,null,null,now()-interval '52 days'),
    (_org,a_wallet,'expense',35000,'Proveedores','Pago empaques',null,s1,p1,now()-interval '40 days'),
    (_org,a_bank,'expense',18500,'Renta','Renta oficina',null,null,null,now()-interval '38 days'),
    (_org,a_bank,'income',19800,'Ventas','Factura A-1034',c2,null,null,now()-interval '34 days'),
    (_org,a_bank,'expense',42000,'Nómina','Nómina 1a quincena',null,null,null,now()-interval '30 days'),
    (_org,a_cash,'expense',2450,'Operación','Gasolina y casetas',null,null,null,now()-interval '26 days'),
    (_org,a_bank,'income',52600,'Servicios','Proyecto implementación',c4,null,null,now()-interval '21 days'),
    (_org,a_bank,'expense',4999,'Software','Licencia contable',null,s3,null,now()-interval '17 days'),
    (_org,a_bank,'income',74900,'Ventas','Factura A-1041',c1,null,null,now()-interval '12 days'),
    (_org,a_bank,'expense',18500,'Renta','Renta oficina',null,null,null,now()-interval '8 days'),
    (_org,a_bank,'expense',42000,'Nómina','Nómina 2a quincena',null,null,null,now()-interval '5 days'),
    (_org,a_bank,'income',28700,'Ventas','Factura A-1045',c2,null,null,now()-interval '3 days'),
    (_org,a_cash,'expense',1850,'Operación','Comida equipo',null,null,null,now()-interval '1 day');
end $$;
revoke execute on function public.seed_demo_data(uuid) from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
declare _org uuid;
begin
  insert into organizations(name) values (coalesce(nullif(new.raw_user_meta_data->>'org_name',''),'Mi empresa')) returning id into _org;
  insert into profiles(id,org_id,full_name,role) values (new.id,_org,coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1)),'owner');
  perform public.seed_demo_data(_org);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- demo organization
do $$ declare _org uuid; begin
  insert into organizations(name) values ('Handle Demo PyME S.A. de C.V.') returning id into _org;
  perform public.seed_demo_data(_org);
end $$;
