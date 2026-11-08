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
- Vitest: 48 pruebas, más las de puntos.

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

### ⏳ Falta en Fase 4

1. **`src/lib/cobros.functions.ts`:**
   - `crearCobro`:
     - aceptar `clienteEmail?` y `puntosCanje?`;
     - ligar el cliente con `rpc("cliente_por_email")`;
     - si hay canje, llamar `rpc("aplicar_canje")` y cobrar en Pey **el monto neto**;
     - si Pey falla, cerrar con `rpc("cerrar_cobro", {_estado: "cancelado"})` para devolver los puntos, en lugar del `update` directo actual.
   - `cancelarCobro`: usar `cerrar_cobro`.
   - `estadoCaja`: llamar `vencer_cobros_pendientes(business_id)`.
   - `verificarCobro`: si el cobro no está pagado y ya pasaron más de 15 min, cerrarlo como `expirado`.
2. **Nueva función de servidor `buscarCliente({ email })`** (roles de caja):
   - solo busca, no crea;
   - aplica `expirar_puntos_inactivos`;
   - devuelve nombre, nivel, saldo en este negocio y la regla activa.
3. **Caja (`src/routes/_authenticated/caja.tsx`):**
   - sección opcional "Cliente" con correo, botón Buscar, saldo y nivel;
   - campo "Usar puntos" con botón de máximo;
   - resumen: total, descuento y a cobrar;
   - `CobroEnCurso` debe mostrar el neto y los puntos que ganará;
   - `CobrosDeHoy` debe sumar lo cobrado neto (monto − descuento), como ya lo hace `ventas-del-dia.tsx`.
4. **HND-040 en `/negocio`:** tarjeta "Programa de puntos" (solo gerencia) con:
   - porcentaje;
   - tope por compra;
   - días de vigencia por inactividad;
   - canje máximo;
   - activar o desactivar.

   Se escribe con el cliente del navegador sobre `point_rules`, que RLS ya permite a owner y admin. Valida con `erroresRegla`.
5. **HND-044, monedero (`src/routes/_authenticated/monedero.tsx`):**
   - función de servidor `miMonedero()` (rol `cliente`), con admin client filtrado por el `customer_id` de quien llama, porque el cliente no puede leer `businesses` por RLS;
   - pantalla: saldo por negocio, fecha en que vence, historial de movimientos, nivel y cuántas compras faltan para el siguiente.
6. **Verificación:** prueba E2E en navegador en modo `mock`:
   - regla → cobro con cliente → pago simulado → puntos;
   - cobro con canje → cancelar → devolución;
   - monedero del cliente.

   Al terminar, marcar ✅ HND-040 a 045 en el backlog.

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
