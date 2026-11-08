# Backlog de tickets — Handle

Versión 0.1 · 2026-11-07
Tickets ordenados de lo **elemental** (fundaciones) a **futuros features**. Agrupados por fase y épica.
Convención de ID: `HND-###`. Etiquetas: `setup`, `auth`, `kyb`, `pagos`, `puntos`, `mapa`, `ui`, `infra`, `futuro`.

> Cómo trabajar: tomar los tickets **en orden**. No empezar pagos sin auth+KYB; no empezar puntos sin pagos. Cada ticket debe caber en 1-3 días y tener criterios de aceptación claros.

---

## FASE 0 — Fundaciones (setup)

### ✅ HND-001 · Preparar el repositorio base `setup` `infra`
Forkear/limpiar el repo `handle-finanzas-central`. Quitar/archivar el módulo Stellar/on-chain. Dejar TanStack Start + Supabase + shadcn funcionando en local con `bun dev`.
**Aceptación:** `bun dev` levanta la app; no hay dependencias de Stellar en el build.

### ✅ HND-002 · Proyecto Supabase + variables de entorno `setup` `infra`
Crear proyecto Supabase. Configurar `.env` local con claves (solo server-side las sensibles). Documentar en README.
**Aceptación:** la app conecta a Supabase; secretos no expuestos al cliente.

### ✅ HND-003 · Esquema base de datos inicial (migraciones) `setup` `infra`
Crear migraciones Drizzle/SQL para `organizations`, `profiles`, `businesses`, `kyb_documents`, `kyb_reviews`, `pey_accounts`, `charges`, `customers`, `point_rules`, `point_transactions`. Incluir enums.
**Aceptación:** migración aplica sin error; tablas visibles en Supabase.

### ✅ HND-004 · Políticas RLS base por rol y org `setup` `infra` `auth`
Definir RLS multi-tenant por `org_id` + `role`; política global para `admin_red`.
**Aceptación:** un usuario de org A no puede leer datos de org B (test).

> HND-005 (preset de Cloudflare) se movió a la Fase 6: primero se construye todo en local y el deploy va al final.

---

## FASE 1 — Autenticación y roles

### ✅ HND-010 · Login email / magic link `auth`
Integrar Supabase Auth con magic link. Páginas de login/registro.
**Aceptación:** usuario recibe correo y entra; sesión persiste.

### ✅ HND-011 · Perfil, rol y pertenencia a org `auth`
Al registrarse se crea `profile` con `role` y `org_id`. Roles: `admin_red`, `dueno`, `cajero`, `cliente`.
**Aceptación:** el rol determina a qué panel entra el usuario.

### ✅ HND-012 · Guardas de ruta por rol `auth` `ui`
Middleware/guards que redirigen según rol y bloquean rutas no permitidas.
**Aceptación:** un cajero no puede abrir el panel de admin.

### ✅ HND-013 · Layout y navegación por rol `ui`
Shell de la app con navegación distinta por rol (admin, dueño, cajero, cliente).
Ya hecho en HND-012: el menú solo muestra lo que cada rol puede abrir (`src/lib/roles.ts`). Queda el diseño por rol: caja pensada para celular (pantalla completa, botones grandes), monedero simple para el cliente, y encabezado sin elementos del ERP para cajero y cliente.
**Aceptación:** cada rol ve su menú correspondiente.

---

## FASE 2 — KYB / onboarding de negocios

### ✅ HND-020 · Formulario de alta de negocio `kyb`
Captura: nombre comercial, razón social, tipo de persona, RFC, categoría, teléfono, domicilio, CP.
**Aceptación:** se crea `business` en estado `borrador`.

### ✅ HND-021 · Validaciones de formato (RFC, CURP, CP) `kyb`
Validación cliente + servidor de RFC, CURP y código postal.
**Aceptación:** formatos inválidos se rechazan con mensaje claro.

### ✅ HND-022 · Subida de documentos a Storage privado `kyb` `infra`
Bucket privado; subir INE, constancia fiscal, comprobante de domicilio, titularidad de cuenta.
**Aceptación:** documentos quedan en Storage; solo dueño y admin acceden.

### ✅ HND-023 · Enviar expediente a revisión `kyb`
Botón que pasa el negocio de `borrador` a `en_revision`.
**Aceptación:** el expediente aparece en la cola del admin.

### ✅ HND-024 · Panel de admin: cola de revisión KYB `kyb` `ui`
Lista de expedientes `en_revision`, ver documentos, aprobar/rechazar con notas.
**Aceptación:** admin aprueba/rechaza; queda `kyb_review` (bitácora).

### ✅ HND-025 · Geocodificación al aprobar (Nominatim) `kyb` `mapa`
Al aprobar, geocodificar domicilio y guardar lat/lng; marcar `activo=true`.
**Aceptación:** negocio aprobado tiene coordenadas o queda marcado "sin ubicar".

---

## FASE 3 — Pagos con Pey (CoDi)

### ✅ HND-030 · Abstracción PaymentProvider + MockPeyProvider `pagos` `infra`
Interfaz `PaymentProvider` y mock para desarrollar sin sandbox de Pey.
**Aceptación:** con `PAYMENTS_PROVIDER=mock` el flujo completo funciona simulado.

### ✅ HND-031 · Conectar cuenta CoDi del negocio (Pey) `pagos`
Registrar/consultar cuenta CoDi vía Pey; manejar estado `en_registro` (~5 días).
**Aceptación:** `pey_account` se crea y refleja estado real.

### ✅ HND-032 · Generar cobro por QR CoDi `pagos` `ui`
Pantalla de caja: ingresar monto, generar QR CoDi, mostrarlo.
**Aceptación:** se crea `charge` pendiente y se muestra el QR.

### ✅ HND-033 · Generar cobro por push CoDi `pagos` `ui`
Enviar cobro al teléfono del cliente vía Pey.
**Aceptación:** se crea `charge` pendiente tipo `push`.

### ✅ HND-034 · Webhook de pago (idempotente) + conciliación `pagos` `infra`
Endpoint que recibe el webhook de Pey, verifica firma, marca `charge=pagado`, crea `transaction` de ingreso.
**Aceptación:** pago duplicado no se procesa dos veces; ingreso queda registrado.

### ✅ HND-035 · Dashboard de ventas del día (dueño) `pagos` `ui`
Ventas del día, # de cobros, ticket promedio, desglose por cajero.
**Aceptación:** refleja los `charges` pagados del día.

---

## FASE 4 — Lealtad / puntos

### HND-040 · Reglas de puntos por negocio `puntos`
CRUD de `point_rules` (porcentaje, tope, vigencia).
**Aceptación:** el dueño define cómo se otorgan puntos.

### HND-041 · Acumular puntos al confirmarse el cobro `puntos`
Al marcar `charge=pagado` con `customer_id`, insertar `point_transaction` de acumulación.
**Aceptación:** el saldo del cliente sube según la regla.

### HND-042 · Identificar cliente en caja (por email) `puntos` `ui`
En el cobro, buscar/crear `customer` por email para ligarle los puntos.
**Aceptación:** se puede cobrar con o sin cliente identificado.

### HND-043 · Canje de puntos como descuento `puntos` `ui`
Aplicar puntos como descuento en un cobro; registrar `point_transaction` de canje.
**Aceptación:** el descuento baja el monto y el saldo de puntos.

### HND-044 · Monedero del cliente (panel cliente) `puntos` `ui`
Saldo de puntos, historial de movimientos, por negocio.
**Aceptación:** el cliente ve su saldo calculado del ledger.

### HND-045 · Niveles de cliente (nuevo/confianza/vip) `puntos`
Reglas que suben el nivel según historial; afectan beneficios.
**Aceptación:** el nivel cambia automáticamente al cumplir criterios.

---

## FASE 5 — Mapa y descubrimiento

> Estado: HND-050 a 053 con código listo en la rama `fase-5-mapa` (ver `05-estado-del-proyecto.md` §4). **Sin ✅ todavía:** falta aplicar la migración `20261108030000_mapa_publico.sql` y verificar en navegador con negocios reales.

### HND-050 · Mapa público con MapLibre + tiles OSM `mapa` `ui`
Render del mapa con pines de negocios `aprobado + activo`.
**Aceptación:** se ven los pines con coordenadas reales.

### HND-051 · Filtro por categoría `mapa` `ui`
Filtrar pines por abarrotes/carnicería/taquería/etc.
**Aceptación:** el filtro actualiza los pines mostrados.

### HND-052 · Perfil público del negocio `mapa` `ui`
Página de perfil: nombre, categoría, horario, promos, ubicación.
**Aceptación:** accesible desde el pin del mapa.

### HND-053 · Marcar "negocio recomendado" (admin) `mapa` `kyb`
Admin marca negocios como recomendados; se destacan en el mapa.
**Aceptación:** los recomendados se distinguen visualmente.

---

## FASE 6 — Landing y lanzamiento

### HND-060 · Landing principal `ui`
Implementar la landing con el copy de `03-landing.md` (hero, beneficios, cómo funciona, FAQ, footer). Mobile-first.
Incluye reemplazar el logo: hoy apunta al almacén de assets de Lovable (`/__l5e/assets-v1/...`) y sale roto en local; debe vivir en `public/`.
**Aceptación:** landing responsive con CTAs funcionales.

### HND-061 · Aviso de privacidad y términos `infra`
Aviso de privacidad (LFPDPPP) y términos (incluye que los puntos no son efectivo).
**Aceptación:** enlaces legales activos y aceptación registrada.

### HND-005 · Preset de despliegue Cloudflare `setup` `infra`
Configurar preset Cloudflare Workers en TanStack Start/Nitro; pipeline de build. Incluye verificar que ningún secreto (service role, llaves de Pey) quede en el bundle y probar el artefacto en el runtime de Workers.
**Aceptación:** build de producción genera artefacto compatible con Cloudflare (aún sin deploy público).

### HND-062 · Deploy a Cloudflare (producción) `infra`
Desplegar a Cloudflare Workers con variables de producción y Pey real.
Antes del deploy, en Supabase → Authentication:
- **URL Configuration:** Site URL = dominio de producción; agregar `https://<dominio>/auth` a Redirect URLs. (En local no hace falta: Supabase acepta `localhost:8080` porque solo compara el host con la Site URL `localhost:3000`.)
- **SMTP propio** (p. ej. Resend) con dominio verificado (SPF/DKIM/DMARC): el SMTP incluido solo envía a miembros del equipo de Supabase y tiene un límite bajo por hora.

Pey real — **verificado en local el 2026-11-08** con la cuenta de prueba de Pey (CLABE ••0385): la API key autentica; el alta de cuenta (`POST /bank-account`) responde y la cuenta pasa a ACTIVE al consultarla; se crea un QR CoDi real de $0.01 (`POST /codi/qr`) y la verificación de pago (`GET /transaction/codi/qr/{id}`) responde sin errores.
Pendiente antes de producción:
- Cerrar el ciclo con un pago real de $0.01 (escanear el QR) y confirmar la conciliación automática. Probar también el cobro push.
- En portal.mipey.mx: crear el webhook apuntando a `https://<dominio>/api/webhooks/pey` y poner en el servidor el `PEY_WEBHOOK_SECRET` que muestra el portal (en local Pey no alcanza localhost: ahí concilia la verificación periódica de la caja). Revisar "Webhook Logs" en el portal.
- **Rotar la API key**: la de pruebas se compartió en una conversación. Las llaves de Pey son siempre `sk_live_` (no hay sandbox).
- Confirmar con Pey: límites de monto por cobro, comisión (`amountBreakdown.fee`) y si existen eventos de cobro vencido o rechazado.
**Aceptación:** app accesible en dominio público.

---

## FUTUROS FEATURES (backlog largo) `futuro`

- **HND-100** Promociones y campañas (2x1, puntos dobles, happy hour) por negocio y de red.
- **HND-101** Puntos interoperables entre negocios de la red (gano en uno, gasto en otro) — diferenciador clave.
- **HND-102** Reseñas y recomendaciones de clientes en el perfil del negocio.
- **HND-103** Pagos con tarjeta/Stripe vía Pey (además de CoDi).
- **HND-104** PWA / modo offline para caja con mala conexión.
- **HND-105** App móvil nativa.
- **HND-106** Multi-sucursal por negocio.
- **HND-107** Reportes avanzados y exportación (CFDI, contabilidad).
- **HND-108** "Fíalo" / crédito de confianza basado en historial (requiere análisis legal).
- **HND-109** Integración KYC automatizada (MetaMap/Truora) para sustituir revisión manual.
- **HND-110** Notificaciones (push/WhatsApp) de promos a clientes cercanos.
- **HND-111** Panel de analítica de la red (salud, cohortes, retención).
- **HND-112** Asistente IA del negocio (del repo base: categorización y consultas en lenguaje natural).
- **HND-113** Baja de cuenta y anonimización (LFPDPPP): la bitácora KYB es inmutable y bloquea borrar un negocio revisado o a su revisor. Definir cómo cumplir el derecho de cancelación (anonimizar datos personales conservando la auditoría).
- **HND-114** Rechazo por documento: que la red marque qué documento específico debe corregirse (hoy el rechazo es del expediente completo y el motivo va en la nota).
- **HND-115** Ajuste manual del pin: cuando Nominatim no encuentra la dirección (o solo ubica el código postal), que la red pueda mover el pin en el mapa.
- **HND-116** Vencer cobros en la base: hoy un cobro pendiente se muestra "Vencido" en pantalla a los 10 min, pero en la base sigue "pendiente". Un job (pg_cron) que lo marque `expirado`.
- **HND-117** Comisiones de Pey: registrar la comisión de cada cobro (`amountBreakdown.fee`) como egreso para que el saldo en Handle coincida con lo que llega al banco.
