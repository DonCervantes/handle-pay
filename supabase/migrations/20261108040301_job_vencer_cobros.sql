-- =============================================================================
-- HND-116 · Job programado que vence los cobros pendientes
--
-- Hoy un cobro abandonado solo pasa a "expirado" cuando alguien vuelve a abrir la
-- caja (estadoCaja) o cuando verificarCobro lo revisa. Este job llama cada 5
-- minutos a vencer_cobros_pendientes() sin argumento (todos los negocios), que
-- cierra como "expirado" los pendientes con más de 15 min y devuelve los puntos
-- reservados (cerrar_cobro). Es idempotente: un cobro ya cerrado no se toca, y si
-- después llega el pago, registrar_pago_pey() lo concilia igual.
--
-- pg_cron corre el job como el dueño de la migración (postgres), que puede
-- ejecutar la función aunque esté revocada para anon/authenticated.
-- Reaplicar esta migración no duplica el job: cron.schedule con el mismo nombre
-- lo actualiza.
-- =============================================================================

create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;

select cron.schedule(
  'vencer-cobros-pendientes',
  '*/5 * * * *',
  $job$select public.vencer_cobros_pendientes()$job$
);
