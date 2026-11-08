# Migraciones pendientes (2026-11-07) — cómo aplicarlas

Proyecto Supabase: **handle-pey** (`eilyixikcuwukejtbjgo`). La base es compartida: avisa antes de correrlas.

## 0. Antes de empezar

- El código que acompaña estas migraciones está en la rama **`integracion-fase-4-5`**.
- **Importante (T2, seguridad de cobros):** después de aplicar, el código viejo de `main` (lo que corre en
  Lovable) falla al cobrar a un cliente **nuevo** con correo. El código de `integracion-fase-4-5` ya está
  adaptado. Aplica estas migraciones cuando estén listos para mergear esa rama a `main`, o acepta que la
  app de Lovable tenga ese fallo hasta el merge.
- La migración del job (T5) vencerá el cobro pendiente de $0.01 de "Tienda Prueba Pey" (queda `expirado`; si
  Pey lo reporta después, `registrar_pago_pey` lo concilia).

## 1. Aplicar

1. Supabase → proyecto handle-pey → **SQL Editor** → New query.
2. Pega **completo** [`2026-11-07_migraciones.sql`](2026-11-07_migraciones.sql) y dale **Run**.
3. Debe terminar sin error ("Success. No rows returned").
   Va todo en una transacción: si algo falla, **no se aplica nada**. Copia el error y mándalo.
   Si el error menciona `pg_cron`, activa la extensión en Database → Extensions → `pg_cron` y vuelve a correrlo.

Contiene, en este orden:

| # | Migración | Qué hace |
|---|---|---|
| 1 | `20261108030000_mapa_publico.sql` | `negocios_publicos()` para el mapa público (sin RFC/CURP/teléfono) |
| 2 | `20261108040201_seguridad_cobros_search_path.sql` | La caja solo liga clientes de su org; `search_path=''` en helpers de RLS |
| 3 | `20261108040301_job_vencer_cobros.sql` | pg_cron cada 5 min vence cobros pendientes |
| 4 | `20261108040401_aceptacion_legal.sql` | Tabla `legal_acceptances` + trigger al registrarse |

## 2. Probar (una por una)

Cada prueba es un archivo de `supabase/tests/`. Pega **uno a la vez** en el SQL Editor y dale Run.
**El resultado correcto es un error que dice `OK`** (`ERROR: P0001: OK`): la prueba revierte todo y no
deja datos. Cualquier otro mensaje (`FALLA n: …`) es un problema: mándalo tal cual.

1. `supabase/tests/mapa_publico.sql`
2. `supabase/tests/seguridad_cobros_search_path.sql`
3. `supabase/tests/job_vencer_cobros.sql`
4. `supabase/tests/aceptacion_legal.sql`

## 3. Después

- Database → **Advisors → Security**: es esperado un aviso por `negocios_publicos()` (security definer
  ejecutable por `anon`, es intencional). Cualquier otro aviso nuevo, repórtalo.
- Avisar a Dylan para que Claude regenere `types.ts` y corra `bun run test:e2e` (las 3 pruebas del mapa
  deben pasar para cerrar HND-050–053).
