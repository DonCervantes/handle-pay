# Estado del proyecto Handle — traspaso para trabajo en paralelo

**Última actualización:** 8 de noviembre de 2026
**Qué es Handle:** cobros CoDi (vía Pey) + programa de puntos para changarros mexicanos (abarrotes, carnicerías, taquerías), con validación KYB de negocios, red de afiliados y mapa real.

Lectura obligada antes de empezar, en este orden:

1. Este archivo.
2. [`AGENTS.md`](../AGENTS.md): reglas de arquitectura.
3. [`docs/00-PRD.md`](00-PRD.md), [`01-TDR.md`](01-TDR.md), [`02-arquitectura-backend.md`](02-arquitectura-backend.md).
4. [`docs/04-backlog-tickets.md`](04-backlog-tickets.md): todos los tickets HND-### con su criterio de aceptación.

---

## 1. Cómo levantarlo en local

```bash
bun install
cp .env.example .env     # pide los valores al dueño del proyecto (nunca se versionan)
bun run dev              # http://localhost:8080
bun run test             # Vitest
set -a; source .env; set +a; bun run test:e2e   # Playwright (solo PAYMENTS_PROVIDER=mock; levanta la app en :8081)
```

- **Stack:** TanStack Start (React 19, TS, Vite), Tailwind + shadcn/ui, Bun.
- **Base de datos:** Supabase, proyecto `handle-pey` (ref `eilyixikcuwukejtbjgo`). **Es una sola base compartida**: no hay copia local por persona (ver §6).
- **Cobros:** `PAYMENTS_PROVIDER="mock"` (simulador, no mueve dinero) para desarrollar. `pey` usa la API real de Pey, que **no tiene sandbox**: cada cobro es dinero real.
- **Login:** magic link por correo. El SMTP incluido de Supabase solo envía a miembros del equipo del proyecto Supabase. Para probar sin correo, usa la API admin `generate_link` con la service role y abre el enlace.
- **Deploy:** queda para el final (Fase 6, Cloudflare). No tocar builds de producción antes.

---

## 2. Lo que ya está hecho

| Fase | Tickets | Qué hay |
|---|---|---|
| 0 · Base | HND-001, 002, 003, 004 | Proyecto Supabase, esquema multi-tenant por `org_id`, RLS en todas las tablas, roles |
| 1 · Acceso | HND-010, 011, 012, 013 | Magic link, 3 tipos de alta (dueño, cliente e invitación de equipo vía `team_invites`), permisos por rol en `src/lib/roles.ts`, bajas de equipo (inactivo + ban) |
| 2 · KYB | HND-020 a 025 | Expediente del negocio en `/negocio`, 4 documentos en bucket privado `kyb`, revisión por `admin_red` en `/red`, geocodificación al aprobar |
| 3 · Cobros | HND-030 a 035 | Cuenta CoDi del negocio, caja (`/caja`) con QR y push, webhooks firmados (Standard Webhooks) e idempotentes, conciliación atómica `registrar_pago_pey()`, consulta a Pey de respaldo, ventas del día |

**Verificación:**

- Pruebas SQL dentro de transacciones que se revierten.
- Pruebas E2E en navegador por rol.
- Advisors de seguridad de Supabase sin hallazgos nuevos.
- Vitest: 73 pruebas (incluye puntos y caja).

**Pey real:**

- **Probado:** API key, alta de cuenta bancaria (`ACTIVE`), QR real y consulta de pago.
- **Sin resolver:** un pago real de $0.01 sale exitoso en el banco, pero Pey no lo registra. El reporte para soporte (`docs/soporte-pey-pago-no-registrado.md`) **no se versiona** porque trae datos de la cuenta bancaria; pídelo al dueño del proyecto. Handle mantiene el cobro como pendiente, que es lo correcto.

---

## 3. En curso: Fase 4 · Puntos (HND-040 a 045)

### Reglas del programa (ya decididas)

- **Valor y uso:** 1 punto = $1 MXN de descuento, válido solo en el negocio donde se ganó. No es dinero: no se retira ni se transfiere, lo que lo deja fuera de la Ley Fintech.
- **Cómo se gana:** sobre lo **pagado** (monto − descuento) × `porcentaje` de la regla × multiplicador del nivel, con tope opcional por compra.
- **Niveles,** según compras pagadas en toda la red; el nivel nunca baja:

  | Nivel | Compras pagadas | Multiplicador |
  |---|---|---|
  | nuevo | 0 | ×1 |
  | confianza | 5 | ×1.25 |
  | vip | 20 | ×1.5 |

- **Canje:**
  - Máximo `canje_max_porcentaje` de la compra (default 50%, máximo 90%); siempre queda algo que pagar por CoDi.
  - Los puntos se **reservan** al crear el cobro y **se devuelven** si el cobro se cancela o vence.
  - Si un pago llega tarde, se vuelven a descontar; si al cliente ya no le alcanzan, el negocio absorbe el descuento.
- **Vigencia:** por inactividad. El saldo vence si el cliente pasa `vigencia_dias` sin movimientos en ese negocio.
- **Escritura:** el ledger `point_transactions` es inmutable y solo lo escribe el servidor (service_role).

### ✅ Hecho en Fase 4

- [x] Migración `supabase/migrations/20261108020000_puntos_lealtad.sql`, **ya aplicada** en Supabase:
  - `point_rules.canje_max_porcentaje`;
  - `cliente_por_email()`;
  - `aplicar_canje()`;
  - `cerrar_cobro()` (cancela o vence y devuelve puntos);
  - `vencer_cobros_pendientes()`;
  - `expirar_puntos_inactivos()`;
  - `multiplicador_nivel()` y `nivel_por_compras()`;
  - `registrar_pago_pey()` reescrita para acumular puntos y subir de nivel.

  Todas son solo para service_role.
- [x] Prueba SQL de la migración con 10 escenarios, todos pasando: acumulación, tope, canje máximo, saldo insuficiente, devolución al cancelar, pago tardío, vencer cobros, subida de nivel, vencimiento por inactividad y permisos.
- [x] Tipos actualizados en `src/integrations/supabase/types.ts`.
- [x] `src/lib/puntos.ts`: lógica pura para vistas previas y validación (`puntosGanados`, `maximoCanje`, `siguienteNivel`, `erroresRegla`, `fechaVencimiento`, `NIVELES`), con pruebas en `src/test/puntos.test.ts`.

- [x] **`src/lib/cobros.functions.ts`** (rama `fase-4-puntos`):
  - `crearCobro` acepta `clienteEmail?` y `puntosCanje?`: liga al cliente con `cliente_por_email`, reserva con `aplicar_canje` y cobra en el proveedor **el neto**. Si el canje o el proveedor fallan, cierra con `cerrar_cobro(_estado: "cancelado")` (ya no hay `update` directo a `charges.estado`). Devuelve `monto`, `descuento`, `neto` y `puntosAGanar` (estimado).
  - `cancelarCobro` usa `cerrar_cobro`; `estadoCaja` llama `vencer_cobros_pendientes(business_id)`; `verificarCobro` cierra como `expirado` tras 15 min sin pago (`cobroParaCerrar` en `codi.ts`).
  - Nueva `buscarCliente({ email })` (roles de caja): solo busca (no crea), aplica `expirar_puntos_inactivos` y devuelve nombre, nivel, saldo en este negocio y regla activa.
- [x] **Caja:** sección "Cliente (opcional)" con Buscar, "Usar puntos" con botón Máximo, resumen total / descuento / a cobrar con los puntos que ganará; `CobroEnCurso` muestra el neto y los puntos (al pagarse, los lee del ledger); `CobrosDeHoy` suma lo cobrado neto.
- [x] **HND-040:** tarjeta "Programa de puntos" en `/negocio` (`src/components/programa-puntos.tsx`, solo gerencia), escribe `point_rules` con el cliente del navegador y valida con `erroresRegla`.
- [x] **HND-044 / 045:** `/monedero` con `miMonedero()` (`src/lib/monedero.functions.ts`, rol `cliente`, admin client filtrado por su `customer_id`; solo expone `nombre_comercial` del negocio): nivel y compras para el siguiente, saldo por negocio con fecha de vencimiento e historial (últimos 50).
- [x] Helpers puros con pruebas (`src/test/puntos-caja.test.ts`): `resumenCobro`, `errorCanje`, `cobradoNeto`, `saldosDelMonedero`, `cobroParaCerrar`. Vitest: 73 pruebas. `tsc --noEmit` y `vite build` sin errores.
- [x] ✅ HND-040 a 045 marcados en el backlog.

### ⏳ Falta en Fase 4

1. **Verificación E2E en navegador en modo `mock`** (no se pudo hacer sin credenciales de Supabase):
   - regla → cobro con cliente → pago simulado → puntos;
   - cobro con canje → cancelar → devolución;
   - monedero del cliente.
2. **Decisiones abiertas** detectadas al revisar:
   - `buscarCliente` deja que cualquier cajero confirme si un correo existe en la red y vea su nombre y nivel. Si preocupa la privacidad, devolver solo el saldo en este negocio.
   - En modo `mock` la caja no llama `verificarCobro`, así que un cobro abandonado solo se vence al volver a abrir la caja (`estadoCaja`) o con el job de HND-116.

---

## 4. Lo que falta después

### Fase 5 · Mapa (buena candidata para trabajar en paralelo)

No toca los archivos de la Fase 4.

| Ticket | Qué es |
|---|---|
| HND-050 | Mapa público con MapLibre + OSM. Requiere una **vista pública sin RFC ni CURP**; hoy `businesses` solo lo lee su org o `admin_red` |
| HND-051 | Filtro por categoría |
| HND-052 | Perfil público del negocio |
| HND-053 | Marcar negocio recomendado (`businesses.recomendado`, que solo puede cambiar `admin_red`) |

**Ya existe:**

- `lat` y `lng` se llenan al aprobar el KYB (`src/lib/geocoding.server.ts`, Nominatim).
- Si las coordenadas fallan, se usa el código postal.

#### Estado Fase 5 (rama `fase-5-mapa`, sin aplicar en la base)

Código listo de HND-050 a 053; **ningún ticket con ✅** hasta aplicar la migración y probar en navegador.

- **Migración** `supabase/migrations/20261108030000_mapa_publico.sql` (**NO aplicada**): función `negocios_publicos()` *security definer*, ejecutable por `anon` y `authenticated`. Lista blanca: `id`, `nombre_comercial`, `categoria`, `direccion`, `lat`, `lng`, `horario`, `recomendado` y `puntos_porcentaje` (regla de puntos activa), solo de negocios `aprobado` + `activo`. Nunca RFC, CURP, razón social, teléfono, CP, `org_id` ni datos bancarios. Se eligió función y no vista porque una vista con permisos del dueño es un error del advisor de Supabase.
- **Prueba SQL:** `supabase/tests/mapa_publico.sql` (termina en `raise exception 'OK'`, se revierte). Cubre columnas expuestas, filtro aprobado/activo, que anon no lea `businesses`, que el dueño no se pueda recomendar, que la red sí y que un borrador no pueda ser recomendado.
- **Tipos:** `negocios_publicos` agregado a mano en `src/integrations/supabase/types.ts`; **regenerarlos** después de aplicar.
- **Rutas públicas:** `/mapa` (mapa + lista, filtros `?categoria=` y `?recomendados=true` en la URL) y `/mapa/$id` (perfil: categoría, dirección, cómo llegar, horario, promoción de puntos). Declaradas en `RUTAS_PUBLICAS` de `src/lib/roles.ts`; un test falla si una ruta fuera de `_authenticated` y `/api` no está declarada.
- **MapLibre** se carga con `import()` dentro de un efecto (`src/components/mapa-negocios.tsx`): nunca corre en SSR. Teselas raster de `tile.openstreetmap.org` con atribución.
- **HND-053:** server function `marcarRecomendado` (`src/lib/mapa.functions.ts`, `exigirRol(["admin_red"])` + RLS + trigger `guard_business_write`), con switch en `/red/$id` y estrella en `/red`. Recomendados: pin dorado con ★, primero en la lista y filtro "Recomendados".
- **Lógica pura** en `src/lib/mapa.ts` con pruebas en `src/test/mapa.test.ts`.

**Para cerrar la fase:**

1. Avisar y aplicar la migración.
2. Correr `supabase/tests/mapa_publico.sql`: debe responder `ERROR: OK`.
3. Regenerar tipos y correr advisors. Es esperable un aviso por función *security definer* ejecutable por `anon`: es intencional.
4. E2E: aprobar un negocio en `/red`, verlo en `/mapa` sin sesión, filtrar, abrir el perfil desde el pin, recomendarlo y ver la estrella.
5. Marcar ✅ HND-050 a 053.

**Decisiones abiertas:**

- **Teléfono:** no se publica porque puede ser el celular personal del dueño. Si se quiere mostrar, que sea un campo aparte y opcional, como "teléfono público".
- **`horario`:** no hay pantalla para capturarlo (la UI acepta texto o `{ "lun-sab": "8:00-21:00" }`).
- **Dirección:** se publica la `direccion` del expediente, que es la del comprobante de domicilio **del negocio**. Hay que confirmar que nunca sea un domicilio particular.
- **Teselas en producción:** con tráfico real hay que mover las teselas a un proveedor, porque la política de OSM limita el uso intensivo.

### Fase 6 · Lanzamiento

| Ticket | Qué es |
|---|---|
| HND-060 | Landing para changarros (contenido en [`03-landing.md`](03-landing.md)); sacar el logo de los assets de Lovable |
| HND-061 | Aviso de privacidad y términos (LFPDPPP; los puntos no son dinero) |
| HND-005 | Preset Cloudflare; verificar que ningún secreto entre al bundle |
| HND-062 | Deploy: Site URL y Redirect URLs en Supabase, SMTP propio, webhook de Pey con su secreto, verificar un pago real y rotar llaves |

### Futuros (HND-100 a 117)

Están en el backlog. Los que surgieron al construir:

- **HND-113:** baja de cuenta y anonimización conforme a la LFPDPPP (`kyb_reviews` es inmutable).
- **HND-114:** rechazo por documento.
- **HND-115:** mover el pin a mano.
- **HND-116:** job programado que llame `vencer_cobros_pendientes()` sin argumento. La función ya existe.
- **HND-117:** registrar las comisiones de Pey.

### Pendientes fuera de tickets

- **Seguimiento con soporte de Pey** del pago de $0.01 no registrado.
- **Rotar dos llaves:** la secreta de Supabase y la API key de Pey (se compartieron por chat).
- **"Pagos a proveedores"** (`/pagos`) es solo una pantalla base; su alcance no está definido en el backlog.
- **Datos de prueba en la base:**
  - usuario `duena-pey@handle-prueba.mx`;
  - negocio "Tienda Prueba Pey" (aprobado, cuenta Pey ACTIVE);
  - un cobro pendiente de $0.01.

---

## 5. Convenciones que hay que respetar

- **Acceso:**
  - `src/lib/roles.ts` es la única fuente de verdad de rutas y roles, con denegación por defecto. Un test falla si una ruta privada no tiene regla.
  - Toda función de servidor empieza con `exigirRol(...)` (`src/lib/autorizacion.ts`).
- **Datos:**
  - Lecturas de páginas: cliente del navegador + TanStack Query, con RLS haciendo el filtrado.
  - Lo sensible (dinero, puntos, Pey) va por funciones de servidor con el admin client, siempre filtrando por la org o el cliente de quien llama.
- **Dinero y puntos:**
  - Todo cambio va por funciones SQL atómicas e idempotentes.
  - Nunca hacer `update` directo a `charges.estado` o `descuento_puntos` desde TS.
- **Migraciones:**
  - Un archivo nuevo en `supabase/migrations/` con fecha creciente.
  - Probarlas con un bloque `do $$ … raise exception 'OK' $$` para que se reviertan.
  - Después de aplicarlas, regenerar los tipos y correr los advisors de seguridad.
- **UI:** en español de México, pensada para dueños de changarro. Cajero y cliente usan el marco "simple" (celular, barra inferior); el resto, el de oficina.
- **Secretos:** jamás en el repo, en el chat ni en commits. `.env` está ignorado; `.env.example` lleva los nombres de las variables.

---

## 6. Cómo trabajar dos personas en paralelo

- **Ramas:** una por ticket o fase (`fase-4-puntos`, `fase-5-mapa`) y PR a `main`. No hacer force push a `main`.
- **Reparto propuesto:** una persona termina la **Fase 4** (caja, negocio, monedero, cobros) y la otra empieza la **Fase 5** (mapa: rutas públicas nuevas y una vista SQL nueva). Casi no comparten archivos.
- **Archivos que ambos pueden tocar:**
  - `src/lib/roles.ts` (nuevas rutas);
  - `src/integrations/supabase/types.ts` (tipos generados);
  - `docs/04-backlog-tickets.md`.

  Haz cambios pequeños en ellos y rebase antes del PR.
- **La base de Supabase es compartida:** una migración aplicada afecta a ambos al instante.
  - Avisa antes de aplicar.
  - No borres datos ajenos.
  - Si una migración cambia una función que el otro usa, coordinen.
  - Para aislarse por completo, Supabase permite *branches* de la base (cuesta extra) o `supabase start` en local con Docker.
- **Acceso que necesita la segunda persona:**
  - colaborador en el repo de GitHub;
  - miembro del proyecto Supabase, para el panel y para recibir los magic links;
  - los valores del `.env`, compartidos por un canal seguro y no por el repo.
