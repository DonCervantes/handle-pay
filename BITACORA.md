# Bitácora de cambios — Handle

Registro vivo de lo que se va haciendo, para que quien siga tenga el contexto sin preguntar.
Lo más reciente va arriba. El estado general y el plan completo están en
[`docs/05-estado-del-proyecto.md`](docs/05-estado-del-proyecto.md) y los tickets en
[`docs/04-backlog-tickets.md`](docs/04-backlog-tickets.md).

**Cómo usar este archivo:** cada vez que subas cambios, agrega una entrada arriba con fecha,
rama, qué cambió, cómo se verificó y qué queda pendiente o bloqueado.

---

## Metodología de trabajo con agentes (Claude Code)

Así se ha trabajado en este repo; síguela para que los dos trabajemos igual.

### Roles

- **Coordinador:** la sesión principal de Claude Code que abres tú. No programa las tareas grandes:
  reparte, revisa, integra, aplica migraciones y mantiene esta bitácora.
- **Agentes:** sesiones hijas que lanza el coordinador (herramienta Agent con `isolation: "worktree"`).
  Cada uno trabaja en su propia copia del repo (`.claude/worktrees/…`) y en su propia rama
  (`agente-1`, `agente-2`, …), así nunca se pisan los archivos.

### Flujo

1. **Plan:** las tareas viven en [`PLAN-DE-TRABAJO.md`](PLAN-DE-TRABAJO.md) con ID (T1, T2…), ticket,
   dependencias y archivos principales. Antes de lanzar agentes, agrega ahí las tareas nuevas.
2. **Lanzar agentes:** un prompt idéntico para todos, cambiando solo número de agente y puerto
   (8081, 8082…). El prompt les pide leer `PLAN-DE-TRABAJO.md`, esta bitácora, `AGENTS.md` y
   `docs/05-estado-del-proyecto.md` antes de tocar código, y escalonar su arranque unos segundos.
3. **Reclamar tareas:** el tablero es la carpeta `.claude/tablero/` del checkout principal (no se
   versiona). Un agente reclama con `mkdir .claude/tablero/T<n>`; como `mkdir` es atómico, si falla es
   que otro ya la tiene. Dentro escribe `estado`: `agente-N · en curso`, `lista · commit <sha>` o
   `bloqueada: <motivo>`. Al terminar una tarea reclama la siguiente libre hasta que no quede ninguna.
4. **Probar antes de commit (obligatorio):** `npx bun run test`, `npx tsc --noEmit`, `npx bun run build`
   y la prueba propia de la tarea (Playwright headless para UI, archivo en `supabase/tests/` con
   `raise exception 'OK'` para SQL). Sin pruebas verdes no hay commit. Un commit por tarea.
5. **Integrar:** el coordinador mergea cada rama `agente-N` en la rama de integración, vuelve a correr
   todas las pruebas, actualiza esta bitácora y sube la rama a GitHub.
6. **Migraciones:** los agentes solo escriben el archivo (nombre `20261108040000 + agente*100 + n` para no
   chocar) y su prueba. El coordinador las aplica en orden a Supabase, regenera `types.ts` y corre los
   advisors. Razón: la base es compartida y una migración afecta a todos al instante.

### Reglas que nunca se rompen

- No push ni force push a `main` (está conectado a Lovable). Todo entra por PR.
- `PAYMENTS_PROVIDER="mock"` siempre en desarrollo: Pey no tiene sandbox.
- Los agentes no copian ni imprimen el `.env`; lo cargan con `set -a; source <ruta>/.env; set +a`.
- Datos de prueba en la base compartida solo con correos `*@e2e.handle-prueba.mx` y nombres `E2E…`.
- Los agentes no editan `BITACORA.md` ni `PLAN-DE-TRABAJO.md`: entregan un párrafo en su reporte y el
  coordinador lo consolida (así no hay conflictos de merge en estos archivos).

### Cómo retomarlo tú

1. `git fetch && git checkout integracion-fase-4-5` (o la rama de integración vigente) y lee esta bitácora.
2. Pide el `.env` por un canal privado; nunca va al repo.
3. Abre Claude Code en `handle-pay/` y pídele: "lee BITACORA.md y PLAN-DE-TRABAJO.md, crea
   `.claude/tablero/`, marca como reclamadas las tareas ya listas y lanza N agentes con la metodología de
   la bitácora".

---

## 2026-11-07 · Integrado agente-4: T4 (HND-061), T8 (HND-115). Todas las tareas del plan terminadas

- **T4 · Aviso de privacidad y términos (HND-061), `fad2f23`:** rutas públicas `/privacidad` (LFPDPPP) y
  `/terminos` (los puntos no son efectivo), enlazadas en el pie de la landing y en `/auth`. "Crear cuenta"
  exige marcar la aceptación y manda `terminos_version` y `privacidad_version` en los metadatos del alta.
  Migración **sin aplicar** `20261108040401_aceptacion_legal.sql` (tabla `legal_acceptances` + trigger aparte
  en `auth.users`, nunca hace fallar un alta), prueba `supabase/tests/aceptacion_legal.sql` (`ERROR: OK` en
  PGlite). Sin la migración el alta funciona igual; solo no se registra la aceptación. Playwright 24/24.
- **T8 · Mover el pin (HND-115), `7d4edc2`:** `admin_red` coloca o mueve el pin desde `/red/$id` (server
  function `moverPin`, solo negocios aprobados y dentro de México). Sin migración. Playwright 9/9 con sesión
  `admin_red` real; el dueño queda bloqueado por la base (`42501`). Datos E2E borrados.
- **Bug corregido de paso:** el mapa de `/mapa` medía 0 px de alto (el CSS de MapLibre le ganaba a `absolute`
  de Tailwind v4). Ahora se ve.
- **Verificación tras integrar:** Vitest 110/110, `tsc` 0 errores, build y `verificar:bundle` OK.
- **Decisiones para Dylan:**
  - Textos legales en borrador (`BORRADOR_LEGAL = true` muestra aviso): faltan domicilio y correo del
    responsable en `RESPONSABLE` (`src/lib/legal.ts`) y revisión legal.
  - El personal invitado y las cuentas que ya existían no registran aceptación; decidir si se pide al entrar.
  - ¿El dueño puede mover su propio pin? Hoy no (`guard_business_write`); permitirlo cambia la seguridad.

### Estado del plan

T1–T8 terminadas. Integradas en `integracion-fase-4-5`: T1, T3, T4, T5, T6, T7, T8. **T2 en espera** en la
rama `agente-2` hasta aplicar su migración.

**Migraciones pendientes, en este orden** (cuando llegue `SUPABASE_ACCESS_TOKEN`):

1. `20261108030000_mapa_publico.sql` → prueba `supabase/tests/mapa_publico.sql`
2. `20261108040201_seguridad_cobros_search_path.sql` → `seguridad_cobros_search_path.sql` + integrar `agente-2` (T2) en el mismo paso
3. `20261108040301_job_vencer_cobros.sql` → `job_vencer_cobros.sql` (vencerá el cobro de $0.01 de Tienda Prueba Pey)
4. `20261108040401_aceptacion_legal.sql` → `aceptacion_legal.sql`

Después: regenerar `types.ts`, correr advisors de seguridad y `bun run test:e2e` (las 3 pruebas del mapa
deben pasar para dar ✅ a HND-050–053).

---

## 2026-11-07 · Integrado agente-2: T6 (HND-005). T2 en espera

- **T6 · Cloudflare Workers (HND-005), `c1ecd31` (cherry-pick `c804823`):** preset `cloudflare-module` fijo en
  `vite.config.ts`, `wrangler.jsonc` (Worker `handle-pay`), MapLibre fuera del bundle de servidor (Worker de
  1.05 → 0.76 MiB gzip) y `bun run verificar:bundle` (busca secretos y patrones de llaves en `.output`,
  MapLibre en servidor y tamaño ≤ 3 MiB gzip; `LIMITE_WORKER_MIB=10` en plan de pago). Probado en workerd
  (`wrangler dev`, desde la raíz) y Chromium headless. Secretos en producción con `wrangler secret put`.
  Dentro de un build de Lovable manda su propia config.
- **T2 · Seguridad en BD, `85c4bfc`: NO integrado todavía, a propósito.** Sigue en la rama `agente-2`.
  Restringe `charges_insert_caja` a clientes ya ligados a la org (`cliente_ligado_a_mi_org()`), liga la primera
  compra desde el servidor con `asignar_cliente_cobro()` (solo `service_role`) y pone `search_path=''` en
  `is_admin_red`, `current_org_id`, `has_role`, `my_customer_id`. **Código y migración
  (`20261108040201_seguridad_cobros_search_path.sql`) deben entrar juntos:** el código nuevo sin migración
  cancela los cobros con cliente, y la migración con el código viejo rompe el primer cobro a un cliente nuevo.
  Se integra en el mismo momento en que se aplique la migración. Prueba SQL verificada en PGlite (`ERROR: OK`).
- **Arreglo en `supabase/tests/mapa_publico.sql`** (hallazgo del agente 2): el escenario 4 fallaba porque
  `handle_new_user` ya no usa `raw_app_meta_data` (desde `20261107220100`); ahora se ligan los perfiles a mano.
- **Verificación tras integrar:** Vitest 102/102, `tsc` 0 errores, build y `verificar:bundle` OK.

---

## 2026-11-07 · Integrado agente-1: T1 suite E2E con Playwright

- **Commit `898c943`.** Archivos: `playwright.config.ts`, `e2e/puntos.spec.ts`, `e2e/mapa.spec.ts`,
  `e2e/soporte/`. Script nuevo: `bun run test:e2e` (con el `.env` cargado; levanta la app en :8081).
- **Candados contra dinero real:** la config no arranca si `PAYMENTS_PROVIDER` no es `mock`, el servidor de
  prueba fuerza `mock` y `N8N_WEBHOOK_URL` vacío, y cada cobro exige ver "Modo de pruebas" en la caja.
- **Login sin correo:** `generate_link` con la service role → `/auth/v1/verify` → `/auth#…`.
- **Fase 4 verificada en navegador:** regla de puntos → cobro de $200 con cliente → pago simulado → +20
  puntos (comprobado en BD); canje de 10 → cancelar → devolución; monedero del cliente.
- **Fase 5:** `/mapa` público y filtros pasan. Las 3 pruebas con negocios se **omiten** hasta aplicar
  `20261108030000_mapa_publico.sql`; luego correr `bun run test:e2e` y, si pasan, ✅ HND-050–053.
- **Datos en la base compartida:** dueñas `duena-puntos@` y `duena-mapa@e2e.handle-prueba.mx` con negocios
  "E2E Taquería …" (quedan `activo=false`), y un cliente `cliente-puntos-*@e2e…` por corrida (el ledger es
  inmutable, no se borra). Mientras corre la suite los negocios E2E aparecen unos segundos en `/mapa`.
- **Verificación tras integrar:** Vitest 102/102, `tsc` 0 errores, build correcto. E2E del agente: 5 pasan, 3 omitidas.

---

## 2026-11-07 · Integrado agente-3: T3 (HND-060), T5 (HND-116), T7 (horario)

- **T3 · Landing (HND-060), `3e3a14b`:** landing para changarros en `/` con el copy de `docs/03-landing.md`
  (hero, beneficios, cómo funciona, FAQ, pie). CTAs a `/auth?modo=crear` y `/mapa`. Logo SVG en `public/`
  (se borraron los `src/assets/*.asset.json` que apuntaban a Lovable). Pie reutilizable `pie-publico.tsx`.
  `AGENTS.md` actualizado (sin Stellar, `payments.functions.ts`, `org_wallets`). Playwright 30/30 (móvil y escritorio).
- **T5 · Job que vence cobros (HND-116), `6a04791`:** migración **sin aplicar**
  `20261108040301_job_vencer_cobros.sql` (pg_cron cada 5 min → `vencer_cobros_pendientes()`), prueba
  `supabase/tests/job_vencer_cobros.sql`. Solo se validó sintaxis (sin base). Al aplicarla, el cobro de $0.01
  de "Tienda Prueba Pey" pasará a `expirado` (si Pey lo reporta después, `registrar_pago_pey` lo concilia).
- **T7 · Horario del negocio, `eec21b2`:** tarjeta "Horario de atención" en `/negocio` (gerencia), guarda
  `businesses.horario` como arreglo ordenado; el mapa lo muestra. E2E 9/9 con datos `@e2e`, ya borrados.
- **Verificación tras integrar:** Vitest 102/102, `tsc` 0 errores, build correcto.
- **Decisiones para Dylan:** el copy de puntos se ajustó a "solo en el negocio donde los ganaste" (el
  `03-landing.md` decía "en toda la red"); se quitó "(Definir modelo…)" de "Cuánto cuesta"; "Contacto"
  fuera del pie hasta tener correo; el logo es un SVG nuevo basado en el favicon (reemplazar si hay oficial).

---

## 2026-11-07 · Plan de trabajo y 4 agentes en paralelo (en curso)

**Autor:** Dylan (con Claude Code como coordinador)

- Se creó [`PLAN-DE-TRABAJO.md`](PLAN-DE-TRABAJO.md) con las tareas T1–T8 (E2E con Playwright, seguridad en
  BD, landing HND-060, legales HND-061, job HND-116, Cloudflare HND-005, horario del negocio, mover pin HND-115)
  y las reglas: reclamo atómico en `.claude/tablero/`, pruebas verdes obligatorias antes de cada commit,
  migraciones escritas por agentes pero aplicadas solo por el coordinador.
- 4 agentes trabajando en ramas `agente-1` a `agente-4` (worktrees en `.claude/worktrees/`, no versionados).
  El coordinador integra cada rama en `integracion-fase-4-5` tras volver a correr las pruebas.
- **Migración del mapa (`20261108030000_mapa_publico.sql`): autorizada por Dylan, pendiente de aplicar.**
  En esta máquina no hay Supabase CLI, `psql` ni contraseña de la base, y la llave secreta no ejecuta SQL.
  Se necesita un access token personal de Supabase (`SUPABASE_ACCESS_TOKEN` en `.env`) o pegarla en el SQL Editor.

---

## 2026-11-07 · Fases 4 (puntos) y 5 (mapa) — rama `integracion-fase-4-5`

**Autor:** Dylan (con Claude Code)

### Ramas

| Rama | Contenido | Estado |
|---|---|---|
| `fase-4-puntos` | HND-040 a 045 (puntos) | Código listo, sin E2E en navegador |
| `fase-5-mapa` | HND-050 a 053 (mapa) | Código listo, **migración sin aplicar** |
| `integracion-fase-4-5` | `main` + las dos ramas anteriores, sin conflictos | Pruebas, tipos y build en verde |

Ninguna se ha mergeado a `main` (el repo está conectado a Lovable: no force push a `main`).

### Fase 4 · Puntos (HND-040 a 045)

- `src/lib/cobros.functions.ts`:
  - `crearCobro` acepta `clienteEmail?` y `puntosCanje?`, liga al cliente con `cliente_por_email`, reserva con `aplicar_canje` y cobra el **neto**.
  - Si falla el canje o Pey, cierra con `cerrar_cobro("cancelado")` (devuelve puntos).
  - `cancelarCobro` usa `cerrar_cobro`; `estadoCaja` llama `vencer_cobros_pendientes`; `verificarCobro` expira tras 15 min.
  - Nueva `buscarCliente({ email })` (roles de caja): solo busca, aplica `expirar_puntos_inactivos`.
- `src/lib/monedero.functions.ts` (nuevo): `miMonedero()` para rol `cliente`.
- `src/routes/_authenticated/caja.tsx`: sección Cliente, "Usar puntos" con botón Máximo, resumen total/descuento/a cobrar, cobros del día en neto.
- `src/components/programa-puntos.tsx` (nuevo) en `/negocio`: tarjeta "Programa de puntos" (solo gerencia).
- `src/routes/_authenticated/monedero.tsx`: saldo por negocio, vencimiento, historial, nivel.
- Helpers puros en `src/lib/puntos.ts` y `src/lib/codi.ts`, pruebas en `src/test/puntos-caja.test.ts`.
- **Base de datos:** no requirió migración nueva (la `20261108020000_puntos_lealtad.sql` ya estaba aplicada).

### Fase 5 · Mapa (HND-050 a 053)

- Migración nueva **sin aplicar**: `supabase/migrations/20261108030000_mapa_publico.sql`.
  Crea `negocios_publicos()` (security definer, ejecutable por `anon`) que expone solo id, nombre,
  categoría, dirección, lat/lng, horario, recomendado y % de puntos de negocios aprobados y activos.
  Nunca RFC, CURP, razón social, teléfono, CP, `org_id` ni datos bancarios.
- Prueba SQL: `supabase/tests/mapa_publico.sql` (debe responder `ERROR: OK`; no deja nada escrito).
- Rutas públicas `/mapa` (filtros `?categoria=` y `?recomendados=true`) y `/mapa/$id` (perfil).
  MapLibre (`maplibre-gl@5.24.0`) se carga solo en cliente.
- `/red` y `/red/$id`: `admin_red` marca negocios recomendados (pin dorado ★ en el mapa).
- `src/lib/roles.ts`: `RUTAS_PUBLICAS` + `esRutaPublica`; test que falla si una ruta pública no está declarada.
- `src/integrations/supabase/types.ts`: entrada `negocios_publicos` **escrita a mano**; regenerar tras aplicar la migración.

### Otros

- `.gitignore`: se ignora `.claude/` (worktrees locales de los agentes).
- `.env.example`: se agregaron `GROQ_API_KEY`, `GROQ_MODEL` y `N8N_WEBHOOK_URL`, que el código ya usaba. El `.env` real no se versiona; pide los valores por un canal privado.

### Verificación (2026-11-07, rama `integracion-fase-4-5`)

- Vitest: **92/92** pruebas en 8 archivos.
- `tsc --noEmit`: 0 errores. `bun run build`: correcto.
- Servidor local (`bun run dev`, `PAYMENTS_PROVIDER=mock`): `/`, `/auth`, `/mapa`, `/mapa?categoria=…`, `/mapa/<id>`, `/caja`, `/negocio`, `/monedero` responden 200.
- Llaves de Supabase validadas contra el proyecto (`handle-pey`).
- Base: la Fase 4 ya está en la base (`point_rules.canje_max_porcentaje` existe). `negocios_publicos()` **no existe todavía** (falta la migración), así que `/mapa` carga pero sin negocios.
- **No se hizo E2E en navegador** (no había navegador automatizado en la sesión).

### Pendiente / siguiente paso

1. **Aplicar la migración del mapa** (afecta la base compartida: avisar antes):
   `20261108030000_mapa_publico.sql` → correr `supabase/tests/mapa_publico.sql` → regenerar `types.ts` → advisors
   (es esperado un aviso por la función security definer ejecutable por `anon`).
2. **E2E en navegador en modo `mock`:**
   - regla de puntos en `/negocio` → cobro con cliente en `/caja` → pago simulado → puntos;
   - cobro con canje → cancelar → devolución de puntos;
   - `/monedero` del cliente;
   - `/mapa` sin sesión, filtros, perfil y marcar recomendado desde `/red`.
   Luego marcar ✅ HND-050 a 053 en el backlog.
3. Mergear `integracion-fase-4-5` a `main` por PR cuando el E2E pase.

### Decisiones abiertas y riesgos

- **Privacidad `buscarCliente`:** un cajero puede confirmar si un correo existe en la red y ver nombre y nivel. Opción: devolver solo el saldo en ese negocio.
- **RLS `charges_insert_caja`** no restringe `customer_id`: un cajero con su sesión podría insertar cobros directos con cualquier cliente. Requiere migración pequeña.
- **Cobros abandonados en `mock`** solo vencen al reabrir la caja o con el job HND-116.
- **Mapa:** se publica la dirección del expediente (en persona física puede ser su casa: confirmar). El teléfono no se publica. Las teselas usan `tile.openstreetmap.org` directo (no apto para tráfico de producción). maplibre-gl pesa ~311 KB gzip: revisar contra el límite de Workers en HND-005.
- **Docs desactualizados:** `AGENTS.md` y la landing `/` aún hablan de Stellar / `payments.functions.ts` / `org_wallets`, que ya no existen.
- **Seguridad:** rotar la API key de Pey (se expuso en chat) y la secreta de Supabase.
