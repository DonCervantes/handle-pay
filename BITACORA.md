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

## 2026-11-08 · Pulido de la demo (T21–T23, en curso)

- Estado al empezar: todo T1–T20 en `main` (PRs #1–#4), CI verde, video en el release `demo-video-2026-11-08`.
- **Decisiones de Dylan:** unificar `/clientes` con los clientes de puntos; mostrar puntos redondeados hacia
  abajo; el pin lo sigue moviendo solo la red; no re-hacer el video.
- Rama base **`pulido-demo`**. 3 agentes (`agente-14` a `agente-16`): T21 `/clientes` con clientes reales,
  T22 puntos sin decimales en pantalla, T23 demo sin prefijo "Demo ·" visible + 2 expedientes KYB en revisión +
  `/red` sin negocios inactivos por defecto. Al terminar: integrar, probar, PR a `main` y merge con CI verde.

---

## 2026-11-08 · Demo y video terminados (T13–T20) → PR a `main`

**Resultado final:** demo lista en local y video narrado con la voz de Dylan.

- **Video:** `video/media/salida/handle-demo.mp4` (no versionado: pesa 28.4 MB). **Descarga:**
  https://github.com/DonCervantes/handle-pay/releases/tag/demo-video-2026-11-08 (pre-release publicado por Dylan). H.264 1920×1080 30 fps, audio AAC, **4:35**.
- **T18 · Grabaciones (agente-11, `f8f855f`):** `video/grabar/grabar.mjs` reinicia los datos de demo, levanta
  la app en modo demo y graba e0–e5 de `DEMO.md` con Playwright (1920×1080, cursor visible, ritmo pausado).
  La app corre en un iframe con CSS `zoom` (125 % en escritorio; e3 en marco de celular 390×844) para que el
  texto salga nítido. Salida: `video/media/grabaciones/*.webm` + `marcas.json`. Opciones `--escena`,
  `--sin-reset`, `--solo-medir`.
- **T19 · Narración (agente-12, `91622c5`):** ver entrada anterior. 4:24 de voz, 5,106 caracteres gastados.
- **T20 · Remotion (agente-13, `e8e9c96`):** proyecto Remotion 4.0.538 en `video/` con su propio
  `package.json`. Composición `HandleDemo`: tarjeta de título por escena, grabación ajustada a la voz (acelera
  ≤1.25× o congela el último cuadro; nunca corta la narración), voz y subtítulos por frase; cierre con logo.
  Re-render (~5 min): `cd video && npm install && node preparar.mjs && node render.mjs && node verificar.mjs`.
  Pruebas de lógica `node --test` 6/6. No gastó créditos de ElevenLabs.
- **Coordinador:** datos de demo restablecidos tras grabar (`demo:limpiar && demo:datos`: 12 negocios, 269
  cobros, 80 movimientos de puntos).
- **Verificación final en `demo-solida`:** Vitest 140/140, `tsc` 0 errores, build y `verificar:bundle` OK (sin
  secretos ni modo demo en producción), E2E 13/13 (corrida previa a T18–T20, que no tocan la app). MP4
  verificado: 274.7 s, 1920×1080, con audio.

**Pendiente / decisiones para Dylan y su compañero:**
- **Ver el video y escuchar la voz:** revisar pronunciación de "Handle", "CoDi", "VIP" e "INE" y las frases
  nuevas de `video/narracion/textos.json`. Para corregir: editar el texto y `node video/narracion/narrar.mjs
  --solo <id>` (máx. 2 generaciones por escena; `--max-generaciones` para subirlo), luego re-render.
- En la escena de la red, "Aprobados" muestra 15 negocios (datos ajenos a la demo en la base compartida) y la
  narración dice "doce changarros". Los subtítulos muestran los números con letra.
- Antes de presentar en vivo: `npx bun run demo:limpiar && npx bun run demo:datos`.
- Publicar el MP4 como release (lo hace Dylan; Claude no puede crear superficies públicas):
  `gh release create demo-video-2026-11-08 video/media/salida/handle-demo.mp4 -R DonCervantes/handle-pay --prerelease --title "Video de demo de Handle"`.
  Sin el MP4, el compañero lo regenera: grabaciones (`node video/grabar/grabar.mjs`) y render (ver T20); la narración
  se regenera desde el historial sin gastar créditos solo en la máquina de Dylan (`video/media/` no se versiona).
- Siguen abiertas las decisiones anteriores (textos legales, `/clientes`, prefijo "Demo ·" en el encabezado,
  decimales en puntos, dueño mueve su pin, hosting y SMTP para el deploy).

---

## 2026-11-07 · Video: segunda tanda lanzada (T18–T20, en curso)

- Lanzada automáticamente (Dylan lo autorizó y dejó la sesión trabajando sola). 3 agentes (`agente-11` a
  `agente-13`) sobre `demo-solida`: T18 grabaciones Playwright, T19 narración ElevenLabs con la voz
  "Dylan speedhack" (presupuesto ≤ 6,000 caracteres, caché por texto), T20 composición con Remotion.
- **T19 · Narración (agente-12, `91622c5`), integrada:** `video/narracion/textos.json` (texto por escena, 4,857
  caracteres, sirve también para subtítulos) y `video/narracion/narrar.mjs` (ElevenLabs `eleven_multilingual_v2`,
  voz "Dylan speedhack", `speed 0.9`; caché por texto, historial de versiones, máx. 2 generaciones por escena,
  `--simular`, `--verificar`, `--solo`, `--voz`). MP3 en `video/media/narracion/`: e0 23.0 s, e1 44.5, e2 51.7,
  e3 39.4, e4 44.8, e5 43.2, e6 17.7 → **total 4:24**. Gastados 5,106 caracteres. **Pendiente Dylan:** escuchar
  la pronunciación de "Handle", "CoDi", "VIP" e "INE"; revisar frases nuevas que no estaban en `DEMO.md`.
- Contrato compartido en [`video/escenas.json`](video/escenas.json): 7 escenas (e0 gancho … e6 cierre) basadas en
  `DEMO.md`. Los archivos pesados van en `video/media/` (ignorado por git); el video final quedará en
  `video/media/salida/handle-demo.mp4`.

---

## 2026-11-07 · Demo lista en local: integrados T13, T14, T16 y T17

**Cómo correr la demo:** `npx bun run demo` (red local, imprime URL y QR; `-- --tunel` para URL pública
temporal con cloudflared) → abrir `/demo` y entrar con un toque como dueña, cajero, clienta o red. Guion paso a
paso en [`DEMO.md`](DEMO.md). Reiniciar datos: `npx bun run demo:limpiar && npx bun run demo:datos` (~50 s).

- **T13 · Datos de demo (agente-8, `79ce75b`, `08bdc72`):** `scripts/demo-datos.mjs` (`demo:datos`,
  `demo:limpiar`, `--conteos`). 12 changarros en Santa María la Ribera (CP 06400) aprobados y en el mapa, 3
  recomendados (Doña Lupita, Tacos El Güero, Panadería La Espiga), horarios y reglas de puntos. Cuentas
  `@demo.handle-prueba.mx`: `lupita@` (dueña), `beto.cajero@`, `mariana@` (VIP), `jorge@` (confianza),
  `sofia@` (nuevo), `red@` (`admin_red`). 269 cobros pagados en 30 días por las funciones SQL reales, con
  canjes; fechas de puntos alineadas a su cobro. Idempotente. `--limpiar` borra solo lo de demo (verificado
  contra totales de toda la base). **Usa `SUPABASE_ACCESS_TOKEN`** para limpiar el ledger inmutable y fechar
  los puntos (triggers apagados solo dentro de esa transacción y solo sobre datos de demo).
- **T14 · `/demo` (agente-10, `495b57c`):** entrar sin correo como dueña/cajero/cliente/red con `generate_link`
  + `verifyOtp`. Solo con `DEMO_MODE=true`, `mock` y `vite dev`; en el build de producción el código no existe
  (`verificar:bundle` lo revisa) y `/api/health` reporta `demo`, que `smoke:prod` exige en `false`.
- **T16 · `bun run demo` (agente-10, `eb3553f`):** levanta `vite dev` en `0.0.0.0` con `mock` + `DEMO_MODE`,
  imprime URL y QR. **Bug real arreglado:** por http en la red local la caja no cobraba (`crypto.randomUUID`
  no existe fuera de contexto seguro) → `src/lib/id-unico.ts`. El túnel (`--tunel`) quedó sin probar
  (cloudflared no instalado).
- **T17 · `DEMO.md` (agente-8, `0f6cd7f`):** guion de 6 escenas (mapa → dueña sube puntos al 10 % → cajero
  cobra $250 a Mariana con 50 puntos → monedero en celular → perfil público → la red recomienda y mueve un pin),
  checklist, frases clave y plan B. Ensayado completo con Playwright: 12/12 pasos, escritorio y celular.
- **Coordinador:** `e2e/demo-datos.spec.ts` buscaba "Ventas CoDi de hoy"; T15 lo cambió a "Ventas de hoy".
- **Verificación tras integrar `demo-solida`:** Vitest 140/140, `tsc` 0 errores, build y `verificar:bundle` OK
  (sin secretos, sin modo demo), **`bun run test:e2e` 13/13** contra la base real.
- **Decisiones para Dylan:** el encabezado muestra "Demo · Abarrotes Doña Lupita" (el prefijo es la marca de
  limpieza); no hay expedientes "en revisión" para mostrar la aprobación KYB; los saldos de puntos muestran
  decimales ("130.67 pts"); `/clientes` sigue siendo el directorio del ERP; con `--tunel` cualquiera con el
  enlace entra a las cuentas de demo.
- **Siguiente:** segunda tanda del video (T18 grabaciones, T19 narración con la voz "Dylan speedhack", T20 Remotion).

---

## 2026-11-07 · Demo: integrado T15 (pantallas heredadas)

- **T15 (agente-9, `c53ae20`):** `/dashboard` pasa a "Resumen" con métricas de Handle: hoy (ventas CoDi vs
  ayer, cobros, ticket promedio, ventas por cajero) y 30 días (ventas, puntos entregados y canjeados, clientes que
  regresan, gráfica por día, últimos cobros). Lee `charges` y `point_transactions` con RLS; cálculos puros en
  `src/lib/resumen.ts` (7 pruebas). Menú sin "Pagos a proveedores" (la ruta `/pagos` queda sin enlace),
  "Finanzas" → "Gastos y cuentas" (con el asistente de IA), `/api` sin el endpoint de proveedores y sin desborde
  en celular, título y meta description de Handle. Recorrido Playwright por rol (escritorio y celular): 32
  capturas, 0 errores de consola, 0 desbordes.
- **Verificación tras integrar en `demo-solida`:** Vitest 121/121, `tsc` 0 errores, build y `verificar:bundle` OK.
- **Decisiones para Dylan:** ¿borrar `/pagos` del todo? `/clientes` sigue siendo el directorio del ERP (tabla
  `clients`), distinto de los clientes con puntos (`customers`): unificar o esconder para la demo.

---

## 2026-11-07 · Demo sólida en local y video: diagnóstico y tareas T13–T20 (en curso)

- PR #2 (preparación del deploy) mergeado a `main` por Dylan. **Decisión:** la demo se hace en local (modo
  `mock`, sin deploy); el deploy queda documentado en `DEPLOY.md` para después.
- **Diagnóstico para la demo:** el mapa no muestra ningún negocio (3 en la base: uno sin pin y dos E2E
  inactivos), solo hay 7 clientes y 11 cobros de prueba, no existen cuentas de cajero ni `admin_red`, el login
  por correo solo llega a miembros del equipo de Supabase, y quedan pantallas del ERP original (Dashboard con
  "Saldo total", "Pagos a proveedores" vacío en el menú, textos de `/api` y meta description).
- Rama base **`demo-solida`**. Tareas en `PLAN-DE-TRABAJO.md`: T13 datos de demo, T14 `/demo` para entrar sin
  correo (solo con `DEMO_MODE=true`), T15 limpiar pantallas heredadas, T16 `bun run demo` para celular (red
  local o túnel), T17 guion `DEMO.md`; video: T18 grabaciones Playwright, T19 narración con la voz de Dylan
  (ElevenLabs), T20 composición con Remotion.
- 3 agentes (`agente-8` a `agente-10`) trabajando T13–T17. T18–T20 en una segunda tanda, tras integrar la demo
  y con `ELEVENLABS_API_KEY` y `ELEVENLABS_VOICE_ID` en el `.env`.
- **Datos de demo en la base compartida:** marcados con correos `@demo.handle-prueba.mx` y organizaciones
  "Demo ·"; se borran con `--limpiar`. Los negocios de demo se verán en `/mapa` (también desde la app de Lovable).

---

## 2026-11-07 · HND-062: preparación del deploy terminada (rama `deploy-hnd-062`)

**Decisiones de Dylan:** hosting aún sin decidir (se preparó Cloudflare Workers y se documentó la alternativa
Lovable); dominio inicial `handle-pay.<cuenta>.workers.dev`; proveedor SMTP se decide después.

- **T9 · CI y deploy manual (agente-5, `4e489ec`):** `.github/workflows/ci.yml` (Vitest, `tsc`, build y
  `verificar:bundle` en cada PR y push a `main`, sin secretos, `mock`). `.github/workflows/deploy.yml`
  ("Deploy a Cloudflare", solo manual): modo `simulacion` (por defecto, `wrangler deploy --dry-run`) o
  `desplegar` (solo desde `main`). Se omite si faltan los secrets `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`
  o las variables `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY`. wrangler fijado a 4.158.0.
- **T10 · Scripts de producción (agente-7, `7e715ab`):** `bun run prod:auth` (Site URL, Redirect URLs sumadas a
  las actuales y SMTP vía Management API) y `bun run prod:secretos` (sube 11 variables de servidor desde
  `.env.production` con `wrangler secret put`, valor por stdin). Simulación por defecto; `--aplicar` actúa,
  `--comparar` solo lee. Plantilla `.env.production.example`.
- **T11 · Salud y smoke (agente-6, `984aeb1`):** `GET /api/health` (solo nombres de variables faltantes y modo de
  pagos, 503 si falta algo, `no-store`) y `bun run smoke:prod -- <url> [--pagos=pey|mock]`: `/`, `/mapa`,
  `/auth`, `/api/health`, webhook de Pey rechaza firmas inválidas/viejas (401) y GET (405), y ningún JS servido
  contiene secretos. 11/11 contra `wrangler dev` con Supabase falso.
- **T12 · `DEPLOY.md` (agente-6, `03cbb91`):** runbook completo: Cloudflare (cuenta, token, GitHub
  secrets/variables), `.env.production`, orden deploy → secretos, Supabase Auth, SMTP (el remitente necesita
  dominio propio: `workers.dev` no admite DNS), webhook de Pey, pago real de $0.01, rotación de llaves,
  `wrangler rollback`, dominio propio opcional y alternativa Lovable.
- **Coordinador:** conflicto de `package.json` resuelto (scripts de T10 y T11 juntos) y bandera `--sin-smtp` en
  `prod:auth` para configurar solo las URLs mientras no haya SMTP (hallazgo del agente 6), documentada en `DEPLOY.md`.
- **Verificación tras integrar:** Vitest 114/114, `tsc` 0 errores, build y `verificar:bundle` OK, `prod:auth -- --sin-smtp` probado en simulación.

**Para publicar (Dylan, siguiendo `DEPLOY.md`):** cuenta de Cloudflare + secrets/variables en GitHub,
`.env.production`, correr "Deploy a Cloudflare" desde `main`, `prod:secretos`, `prod:auth -- --sin-smtp`,
`smoke:prod`. Para cerrar HND-062: SMTP con dominio propio, webhook en portal.mipey.mx, pago real de $0.01 y
rotar llaves. Decisiones abiertas: hosting final, proyecto de Supabase de producción (¿el compartido?) y
proveedor de teselas del mapa (`tile.openstreetmap.org` no admite tráfico de producción).

---

## 2026-11-07 · HND-062 Deploy: preparación con agentes (en curso)

- Rama base nueva **`deploy-hnd-062`** (desde `main` tras el PR #1). `PLAN-DE-TRABAJO.md` tiene las tareas
  T9–T12: CI en GitHub Actions + workflow de deploy manual (T9), scripts de producción para Supabase Auth/SMTP y
  secretos de Cloudflare en modo simulación (T10), `/api/health` + smoke test post-deploy (T11) y runbook
  `DEPLOY.md` (T12).
- 3 agentes (`agente-5` a `agente-7`) con la misma metodología. **Tienen prohibido** desplegar, iniciar sesión en
  Cloudflare, cambiar Supabase Auth, tocar el portal de Pey o mover dinero: solo preparan y prueban en local.
- **Lo que necesita Dylan para publicar** (no lo puede hacer un agente): cuenta de Cloudflare (`wrangler login` o
  API token), dominio, cuenta SMTP (p. ej. Resend) con DNS verificado, crear el webhook en portal.mipey.mx, pago
  real de $0.01 y rotar llaves (Pey, Supabase secret, tokens expuestos).

---

## 2026-11-07 · Migraciones aplicadas, todo verificado y PR #1 mergeado a `main`

- **Token:** `SUPABASE_ACCESS_TOKEN` funcional (token con alcance del compañero; el primero no tenía permisos).
  Con él se aplican migraciones vía Management API (`POST /v1/projects/{ref}/database/query`).
- **Migraciones aplicadas** en una sola transacción (Dylan ejecutó el comando) y registradas en
  `supabase_migrations.schema_migrations`: `20261108030000_mapa_publico`, `20261108040201_seguridad_cobros_search_path`,
  `20261108040301_job_vencer_cobros` (job `vencer-cobros-pendientes` activo cada 5 min) y `20261108040401_aceptacion_legal`.
- **Pruebas SQL** contra la base real: las 4 de `supabase/tests/` responden `ERROR: OK` (no dejan datos).
- **`types.ts` regenerado** desde Supabase (`/v1/projects/{ref}/types/typescript`); solo agrega `legal_acceptances`
  respecto a lo escrito a mano.
- **Advisors de seguridad:** nuevos y esperados `negocios_publicos()` (anon, intencional) y
  `cliente_ligado_a_mi_org()` (helper de RLS). Los demás ya existían. Recomendado activar *Leaked password
  protection* en Supabase Auth.
- **Arreglo en E2E:** `e2e/puntos.spec.ts` buscaba "el" switch de `/negocio`, pero T7 agregó los del horario;
  ahora apunta a `#regla-activo`.
- **Verificación final:** Vitest 110/110, `tsc` 0 errores, build y `verificar:bundle` OK (3 secretos comparados),
  **`bun run test:e2e` 8/8 contra la base real** (incluye las 3 del mapa y el cobro con cliente con T2).
- **Backlog:** ✅ HND-050, 051, 052, 053, 060 y 116 (HND-005 y 115 ya estaban). HND-061 sigue sin ✅ hasta tener
  los datos del responsable y la revisión legal.
- **Merge:** PR #1 `integracion-fase-4-5` → `main` con merge commit (sin squash ni force push). Lovable recibe los
  cambios desde `main`.

**Siguiente para quien retome:** decisiones abiertas (textos legales, aceptación de cuentas existentes, si el
dueño mueve su pin, dirección de personas físicas en el mapa, privacidad de `buscarCliente`, logo oficial) y
HND-062 (deploy público: Site URL, SMTP propio, webhook de Pey, rotar llaves). Trabajar desde `main` en ramas nuevas.

---

## 2026-11-07 · PR #1 abierto: `integracion-fase-4-5` → `main`

- PR: https://github.com/DonCervantes/handle-pay/pull/1 (sin conflictos: `main` sigue en `2bb288c`).
- **Dylan autorizó el merge cuando todo esté listo y aprobado.** Criterio de "aprobado":
  1. Migraciones de `supabase/pendientes/` aplicadas por el compañero y sus 4 pruebas SQL con `ERROR: OK`.
  2. Vitest, `tsc`, build y `verificar:bundle` en verde.
  3. `bun run test:e2e` en verde, incluidas las 3 pruebas del mapa.
- **No mergear antes de aplicar las migraciones:** el código de T2 llama a `asignar_cliente_cobro()`; sin ella,
  la app de Lovable cancelaría los cobros con cliente.
- El coordinador (sesión de Dylan) vigila la base cada 2 min y, al detectar las migraciones, corre las pruebas,
  mergea el PR (merge commit, sin squash ni force push) y lo anota aquí.
- `types.ts` no se puede regenerar sin un token de Supabase con permisos: las entradas nuevas se escribieron a
  mano y bastan para compilar. Regenerarlo cuando haya token o con `supabase gen types` del compañero.

---

## 2026-11-07 · T2 integrado y migraciones empaquetadas para aplicar a mano

- El `SUPABASE_ACCESS_TOKEN` recibido no tiene permisos (403: `database_read`, `projects_read`), así que las
  migraciones las aplica el compañero desde el SQL Editor.
- **T2 (`85c4bfc`) integrado** en `integracion-fase-4-5` para que código y migración vayan juntos.
  Vitest 110/110, `tsc` 0 errores, build OK.
- Nuevo [`supabase/pendientes/`](supabase/pendientes/LEEME.md): `2026-11-07_migraciones.sql` con las 4
  migraciones en una sola transacción (SQL validado con libpg_query: 31 sentencias) y `LEEME.md` con los pasos
  para aplicar, probar y qué esperar.
- **Riesgo:** al aplicar T2, el código de `main` (Lovable) falla al cobrar a un cliente nuevo hasta que se
  mergee `integracion-fase-4-5`. Aplicar cerca del merge.

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
