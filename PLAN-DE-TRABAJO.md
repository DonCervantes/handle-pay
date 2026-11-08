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


## Tareas — HND-062 Deploy (desde 2026-11-07, rama base `deploy-hnd-062`)

Preparación que no necesita cuentas externas. Lo que sí las necesita (login de Cloudflare, dominio, SMTP,
webhook en el portal de Pey, pago real, rotar llaves) lo hace Dylan; ver "Fuera del plan".

| ID | Tarea | Ticket | Depende de | Archivos principales |
|---|---|---|---|---|
| T9 | CI en GitHub Actions: en cada PR corre Vitest, `tsc`, build y `verificar:bundle`; workflow de deploy a Cloudflare (`wrangler deploy`) **manual** (`workflow_dispatch`) que usa secrets `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` y no corre si faltan | HND-062 | — | `.github/workflows/` |
| T10 | Scripts de producción **en modo simulación por defecto**: (a) `scripts/supabase-auth-prod.mjs` que con el Management API configura Site URL, Redirect URLs (`https://<dominio>/auth`) y SMTP a partir de variables; (b) `scripts/cloudflare-secrets.mjs` que sube con `wrangler secret put` las variables de servidor desde un `.env.production` (nunca las imprime). Solo aplican con `--aplicar` | HND-062 | — | `scripts/`, `.env.production.example` |
| T11 | Verificación post-deploy: endpoint `/api/health` (sin datos sensibles), script `scripts/smoke-prod.mjs <url>` que revisa `/`, `/mapa`, `/auth`, `/api/health`, que el webhook de Pey rechace firmas inválidas y que no haya secretos en el JS servido; probarlo contra `wrangler dev` local con webhook firmado de prueba | HND-062 | — | `src/routes/api/`, `scripts/` |
| T12 | `DEPLOY.md`: runbook paso a paso para Dylan (Cloudflare login/token, dominio, Resend con SPF/DKIM/DMARC, Supabase Auth, webhook de Pey, pago real de $0.01, rotación de llaves, rollback con `wrangler rollback`), enlazando los scripts de T9–T11 | HND-062 | T9–T11 (coordinar nombres) | `DEPLOY.md` |

## Tareas — Demo sólida en local y video (desde 2026-11-07, rama base `demo-solida`)

Objetivo: una demo de 5–7 min en local (modo `mock`, sin deploy) y un video narrado con la voz de Dylan.
Diagnóstico al crear estas tareas: el mapa no muestra ningún negocio, no hay cuentas de cajero ni de
`admin_red`, el login por correo solo llega a miembros del equipo de Supabase y quedan pantallas del ERP
original (Dashboard genérico, "Pagos a proveedores" vacío, textos de `/api` y meta description).

| ID | Tarea | Depende de | Archivos principales |
|---|---|---|---|
| T13 | **Datos de demo.** `scripts/demo-datos.mjs` idempotente (service role) con `--limpiar`: ~12 changarros en una colonia de CDMX (aprobados, con pin, categorías variadas, 3 recomendados, horarios, reglas de puntos), usuarios por rol (dueña, cajero, 3 clientes, `admin_red`) con correos `@demo.handle-prueba.mx`, y 30 días de cobros pagados con puntos y niveles distintos. Constantes de cuentas en `src/lib/demo.ts` | — | `scripts/`, `src/lib/demo.ts` |
| T14 | **Entrar sin correo en la demo.** Página `/demo` con botones "Entrar como dueña / cajero / cliente / red" que crea la sesión con `generate_link` desde el servidor, **solo** si `DEMO_MODE=true` y solo para correos `@demo.handle-prueba.mx`. Apagada por defecto; `/api/health` y `verificar:bundle` deben confirmar que en producción no existe | T13 (constantes) | `src/routes/demo.tsx`, `src/lib/demo.functions.ts`, `roles.ts` |
| T15 | **Limpiar pantallas heredadas.** Dashboard con métricas de Handle (ventas de hoy, cobros, puntos emitidos y canjeados, clientes recurrentes); quitar "Pagos a proveedores" del menú; revisar `/finanzas` y `/api`; meta description de Handle. Recorrido Playwright por cada rol: captura de cada pantalla y cero errores de consola | T13 para datos | `dashboard.tsx`, `route.tsx`, `__root.tsx` |
| T16 | **Demo en celular.** `bun run demo`: levanta la app con `mock` + `DEMO_MODE` en `0.0.0.0` (red local) e imprime la URL y un QR para abrirla; opción `--tunel` con `cloudflared tunnel --url` (sin cuenta). Verificar que el QR de la caja se lee desde otro dispositivo | T14 | `scripts/demo.mjs` |
| T17 | **Guion de demo `DEMO.md`.** Historia de 5–7 min: dueña configura puntos → cajero cobra con cliente → pago simulado → cliente ve su monedero → mapa público y perfil → red recomienda y mueve pin. Checklist previo, frases clave, plan B si algo falla | T13–T16 | `DEMO.md` |
| T18 | **Grabaciones del video.** Playwright graba cada escena del guion a 1920×1080 con cursor visible y pausas legibles → `video/grabaciones/*.webm` | T13–T17 | `video/grabar/` |
| T19 | **Narración con la voz de Dylan.** Texto por escena (tono cercano, español de México) y `video/narrar.mjs` que genera un MP3 por escena con ElevenLabs (`ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` del `.env`) y guarda las duraciones | T17 | `video/narracion/` |
| T20 | **Video con Remotion.** Proyecto `video/` que compone grabaciones + narración + títulos y subtítulos, ajusta cada escena a la duración de su audio y renderiza `video/salida/handle-demo.mp4` | T18, T19 | `video/` |

## Tareas — Pulido de la demo (desde 2026-11-08, rama base `pulido-demo`)

Decisiones de Dylan (2026-11-08): unificar `/clientes` con los clientes de puntos; mostrar puntos redondeados
hacia abajo; el pin lo sigue moviendo solo la red (sin cambios); pulir la demo; **no** re-hacer el video.

| ID | Tarea | Depende de | Archivos principales |
|---|---|---|---|
| T21 | **`/clientes` = clientes reales del changarro.** Lista de `customers` que compraron en el negocio de la org (nombre, correo, compras pagadas, total gastado, puntos en este negocio, nivel, última visita), búsqueda y filtros en la URL, y ficha `/clientes/$id` con historial de cobros y de puntos. Lectura segura: server function con `exigirRol` (roles de oficina) y admin client filtrado por la org de quien llama (el cliente no se lee por RLS). El directorio viejo del ERP (`clients`) deja de mostrarse; no se borra la tabla | — | `src/routes/_authenticated/clientes.*`, `src/lib/clientes*.ts` |
| T22 | **Puntos sin decimales en pantalla.** Formato único `formatPuntos()` que redondea hacia abajo en caja, monedero, resumen, perfil, `/clientes` y `/red`; el canje acepta solo enteros y el "máximo" usa el piso del saldo. La base conserva el valor exacto (sin migración). Pruebas de bordes (130.99 → 130, 0.4 → 0) | — | `src/lib/puntos.ts`, componentes que muestran puntos |
| T23 | **Pulir la demo.** (a) Que no se vea "Demo ·" en la app: cambiar la marca de los datos de demo a algo invisible (p. ej. solo el dominio de correo de los miembros y una marca en metadatos), manteniendo `demo:limpiar` seguro e idempotente; (b) 2 negocios de demo con expediente **en revisión** (documentos de ejemplo en el bucket `kyb`) para mostrar la aprobación KYB desde `/red`; (c) en `/red` → Aprobados, ocultar por defecto los negocios inactivos (con un interruptor para verlos). Actualizar `DEMO.md` con una escena opcional de aprobación KYB | — | `scripts/demo-datos.mjs`, `src/lib/demo.ts`, `src/routes/_authenticated/red.*`, `DEMO.md` |

## Estado

- **2026-11-08:** T1–T20 terminadas. T1–T12 en `main` (PR #1 y #2); T13–T20 en `demo-solida` → PR a `main`. Ver `BITACORA.md`.

Se actualiza en `BITACORA.md` cada vez que el coordinador integra una rama.
