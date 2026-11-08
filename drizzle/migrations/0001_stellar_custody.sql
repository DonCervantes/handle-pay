
create table public.org_wallets (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  public_key text not null,
  secret_key text not null,
  network text not null default 'testnet',
  created_at timestamptz not null default now()
);
-- Server-only: no grants to anon/authenticated, RLS on with no policies.
grant all on public.org_wallets to service_role;
alter table public.org_wallets enable row level security;

alter table public.payments add column if not exists error_message text;
alter table public.payments add column if not exists submitted_at timestamptz;
alter table public.payments add column if not exists confirmed_at timestamptz;

-- Atomic finalize: called only by the server (service role)
create or replace function public.finalize_payment(_payment_id uuid, _hash text)
returns void language plpgsql security definer set search_path = public
as $$
declare p record; acc uuid;
begin
  select * into p from payments where id = _payment_id for update;
  if p is null then raise exception 'payment not found'; end if;
  if p.status = 'confirmed' then return; end if;
  update payments set status='confirmed', stellar_tx_hash=_hash, confirmed_at=now(), error_message=null where id=_payment_id;
  select id into acc from accounts where org_id=p.org_id and type='wallet' order by name limit 1;
  insert into transactions(org_id,account_id,type,amount,currency,category,description,supplier_id,payment_id,occurred_at)
    values (p.org_id, acc, 'expense', p.amount_fiat, p.currency_fiat, 'Proveedores',
      'Pago on-chain a ' || coalesce((select name from suppliers where id=p.supplier_id),'proveedor'),
      p.supplier_id, p.id, now());
  if acc is not null then update accounts set balance = balance - p.amount_fiat where id = acc; end if;
end $$;
revoke execute on function public.finalize_payment(uuid, text) from public, anon, authenticated;
grant execute on function public.finalize_payment(uuid, text) to service_role;

alter publication supabase_realtime add table public.payments;
alter publication supabase_realtime add table public.transactions;
alter publication supabase_realtime add table public.accounts;
