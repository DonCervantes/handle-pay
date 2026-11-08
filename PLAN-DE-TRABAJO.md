# Plan de trabajo — Handle (desde 2026-11-07)

Base: rama `integracion-fase-4-5` (`main` + Fase 4 puntos + Fase 5 mapa).
El historial de lo hecho está en [`BITACORA.md`](BITACORA.md). Contexto completo en
[`docs/05-estado-del-proyecto.md`](docs/05-estado-del-proyecto.md).

## Cómo se trabaja

- **Coordinador** (sesión principal de Claude Code): reparte, revisa, integra cada rama de agente en
  `integracion-fase-4-5` tras volver a correr las pruebas, aplica migraciones a Supabase **una por una**
  y actualiza `BITACORA.md`.
- **Agentes** (en paralelo, cada uno en su worktree y rama `agente-N`): reclaman una tarea libre del
  tablero, la terminan, la prueban, hacen commit y reclaman la siguiente.
- **Reclamo atómico:** `mkdir .claude/tablero/T<n>` en el checkout principal. Si `mkdir` falla, otra
  persona/agente ya la tiene. Dentro se escribe `estado` (`en curso` / `lista` / `bloqueada: <motivo>`).
  El tablero vive en `.claude/` (no se versiona); este archivo es la versión para humanos.
- **Antes de cada commit** (obligatorio): `bun run test`, `tsc --noEmit`, `bun run build` en verde, más
  la prueba específica de la tarea (Playwright en navegador headless o prueba SQL). Sin pruebas verdes no
  hay commit.
- **Migraciones:** los agentes escriben el archivo en `supabase/migrations/` y su prueba en
  `supabase/tests/`, pero **no las aplican**. Las aplica el coordinador en orden.
- **Nunca:** push o force push a `main`, `PAYMENTS_PROVIDER=pey`, secretos en commits, borrar datos
  ajenos en la base compartida. Los datos de prueba E2E se marcan con correos `*@e2e.handle-prueba.mx`.

## Tareas

| ID | Tarea | Ticket | Depende de | Archivos principales |
|---|---|---|---|---|
| T1 | Suite E2E con Playwright (modo `mock`): login por magic link (`generate_link`), regla de puntos → cobro con cliente → pago simulado → puntos; canje → cancelar → devolución; monedero; mapa público, filtros, perfil y recomendado | cierra HND-040–045, 050–053 | migración del mapa para la parte de mapa | `e2e/`, `playwright.config.ts`, `package.json` |
| T2 | Seguridad en BD: `charges_insert_caja` debe restringir `customer_id` a clientes ligados al negocio/org; `search_path = ''` en `is_admin_red`, `current_org_id`, `has_role` | hallazgos de revisión | — | `supabase/migrations/`, `supabase/tests/` |
| T3 | Landing para changarros en `/` con el copy de `docs/03-landing.md`, CTA al mapa y a registro; logo en `public/`. Actualizar `AGENTS.md` (quitar Stellar, `payments.functions.ts`, `org_wallets`) | HND-060 | — | `src/routes/index.tsx`, `public/`, `AGENTS.md` |
| T4 | Aviso de privacidad (LFPDPPP) y términos (los puntos no son efectivo) como rutas públicas, enlaces en footer y aceptación registrada al registrarse | HND-061 | T3 para el footer (coordinar) | `src/routes/privacidad.tsx`, `terminos.tsx`, `roles.ts` |
| T5 | Job pg_cron que marque `expirado` los cobros pendientes vencidos llamando `vencer_cobros_pendientes()` | HND-116 | — | `supabase/migrations/`, `supabase/tests/` |
| T6 | Preset Cloudflare Workers: build compatible, verificar que ningún secreto entre al bundle (script de verificación), sacar `maplibre-gl` del bundle de servidor y medir tamaño contra el límite de Workers | HND-005 | — | `vite.config.ts`, `scripts/` |
| T7 | Captura de horario del negocio en `/negocio` (hoy `businesses.horario` no se llena y el mapa dice "aún no publica su horario") | mejora Fase 5 | — | `src/routes/_authenticated/negocio.tsx`, componente nuevo |
| T8 | Mover el pin a mano (`admin_red` o dueño corrige lat/lng con un mapa) | HND-115 | — | `/red/$id`, `/negocio` |

**Fuera de este plan** (requieren decisión o acción externa de Dylan): deploy público (HND-062), seguimiento
con soporte de Pey, rotación de llaves, publicar dirección de personas físicas en el mapa, privacidad de
`buscarCliente`.

## Estado

Se actualiza en `BITACORA.md` cada vez que el coordinador integra una rama.
