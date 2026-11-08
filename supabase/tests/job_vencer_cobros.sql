-- =============================================================================
-- Prueba de 20261108040301_job_vencer_cobros.sql (HND-116)
--
-- Correr DESPUÉS de aplicar la migración, en el SQL editor de Supabase (como
-- postgres). Termina con raise exception 'OK': si ves "ERROR: OK" pasaron todos
-- los escenarios y NADA quedó escrito (la transacción se revierte, incluido el
-- efecto de correr el comando del job sobre otros cobros). Cualquier otro error
-- indica qué escenario falló.
-- =============================================================================
do $$
declare
  _org      uuid := gen_random_uuid();
  _neg      uuid;
  _viejo    uuid;
  _reciente uuid;
  _pagado   uuid;
  _job      record;
  _estado   public.estado_cobro;
begin
  -- 1. pg_cron instalado y job registrado una sola vez, activo, cada 5 minutos.
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'FALLA 1: pg_cron no está instalado';
  end if;
  if (select count(*) from cron.job where jobname = 'vencer-cobros-pendientes') <> 1 then
    raise exception 'FALLA 1: debe existir exactamente un job vencer-cobros-pendientes';
  end if;
  select * into _job from cron.job where jobname = 'vencer-cobros-pendientes';
  if _job.schedule <> '*/5 * * * *' or not _job.active then
    raise exception 'FALLA 1: job con horario % / activo %', _job.schedule, _job.active;
  end if;
  if _job.command !~ 'public\.vencer_cobros_pendientes\(\)' then
    raise exception 'FALLA 1: el job no llama vencer_cobros_pendientes(): %', _job.command;
  end if;

  -- Datos de prueba (se revierten al final).
  insert into public.organizations (id, name) values (_org, 'E2E prueba job cobros');
  insert into public.businesses (org_id, nombre_comercial, categoria)
  values (_org, 'E2E Negocio Job Cobros', 'abarrotes')
  returning id into _neg;

  insert into public.charges (business_id, monto, tipo, idempotency_key, created_at)
  values (_neg, 50, 'qr', 'e2e-job-viejo-' || gen_random_uuid(), now() - interval '20 minutes')
  returning id into _viejo;
  insert into public.charges (business_id, monto, tipo, idempotency_key, created_at)
  values (_neg, 60, 'qr', 'e2e-job-reciente-' || gen_random_uuid(), now() - interval '2 minutes')
  returning id into _reciente;
  insert into public.charges (business_id, monto, tipo, idempotency_key, created_at, estado, paid_at)
  values (_neg, 70, 'qr', 'e2e-job-pagado-' || gen_random_uuid(), now() - interval '1 hour',
          'pagado', now() - interval '55 minutes')
  returning id into _pagado;

  -- 2. Correr el comando exacto que corre pg_cron.
  execute _job.command;

  select estado into _estado from public.charges where id = _viejo;
  if _estado <> 'expirado' then
    raise exception 'FALLA 2: el pendiente de hace 20 min quedó en %', _estado;
  end if;
  select estado into _estado from public.charges where id = _reciente;
  if _estado <> 'pendiente' then
    raise exception 'FALLA 3: el pendiente de hace 2 min quedó en %', _estado;
  end if;
  select estado into _estado from public.charges where id = _pagado;
  if _estado <> 'pagado' then
    raise exception 'FALLA 4: un cobro pagado cambió a %', _estado;
  end if;

  -- 5. Idempotente: correrlo otra vez no falla ni cambia nada de lo nuestro.
  execute _job.command;
  if (select estado from public.charges where id = _viejo) <> 'expirado'
     or (select estado from public.charges where id = _reciente) <> 'pendiente' then
    raise exception 'FALLA 5: la segunda corrida cambió los estados';
  end if;

  raise exception 'OK';
end
$$;
