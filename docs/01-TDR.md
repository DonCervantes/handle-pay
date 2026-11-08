# TDR — Handle

**Documento de Diseño Técnico (Technical Design/Requirements)**
Versión 0.1 · 2026-11-07 · Estado: Borrador

---

## 1. Visión técnica

Aplicación full-stack **TanStack Start** (React + TypeScript) desplegada en **Cloudflare Workers**, con **Supabase** (Postgres + Auth + Storage) como backend de datos, la **API de Pey** como procesador de cobros CoDi, y **MapLibre + OSM/Nominatim** para el mapa. Multi-tenant por `org_id` con Row Level Security.

---

## 2. Stack definitivo

| Capa | Tecnología | Notas |
|------|-----------|-------|
| Framework | TanStack Start + React + TS | Server functions; reutiliza repo base |
| UI | Tailwind CSS + shadcn/ui | — |
| Auth | Supabase Auth | email / magic link, todos los roles |
| BD | Supabase Postgres + RLS | multi-tenant por `org_id` |
| Storage | Supabase Storage | buckets privados para KYB |
| Pagos | API Pey (CoDi QR + push) | claves solo server-side |
| Mapa | MapLibre GL JS + tiles OSM | render en cliente |
| Geocoding | Nominatim (OSM) | 1 req/s, al aprobar negocio |
| Hosting | Cloudflare Workers (preset Nitro) | — |
| Tooling | Bun, Vite, Vitest, Drizzle ORM | del repo base |

---

## 3. Arquitectura lógica

> Diagramas en [`02-arquitectura-backend.md`](02-arquitectura-backend.md).

Capas:
1. **Cliente (browser/PWA):** React + MapLibre. No habla directo con Pey ni con secretos.
2. **Edge / Server (Cloudflare Worker):** server functions de TanStack Start. Orquesta Pey, Nominatim y Supabase con service role donde aplica. Verifica webhooks.
3. **Datos (Supabase):** Postgres con RLS, Auth, Storage.
4. **Externos:** Pey (CoDi), Nominatim (geocoding).

---

## 4. Modelo de datos

> Reutilizado del repo: `organizations`, `profiles`, `accounts`, `transactions`, `api_keys`, `webhooks`.
> Nuevo / adaptado a continuación. Todas las tablas con `created_at`, `updated_at` y RLS por `org_id` (salvo `customers` y tablas públicas del mapa).

### 4.1 Red de afiliados / KYB
```
businesses
  id (uuid, pk)
  org_id (fk organizations)
  nombre_comercial (text)
  razon_social (text)
  tipo_persona (enum: fisica | moral)
  rfc (text)                       -- validado por formato
  curp (text, nullable)
  categoria (enum: abarrotes | carniceria | taqueria | tienda | otro)
  telefono (text)
  direccion (text)
  cp (text)
  lat (numeric, nullable)          -- geocodificado al aprobar
  lng (numeric, nullable)
  estado_kyb (enum: borrador | en_revision | aprobado | rechazado)
  recomendado (bool, default false) -- lo marca admin de red
  activo (bool, default false)
  horario (jsonb, nullable)

kyb_documents
  id (uuid, pk)
  business_id (fk businesses)
  tipo (enum: ine | constancia_fiscal | comprobante_domicilio | titularidad_cuenta)
  storage_path (text)              -- bucket privado
  estado (enum: pendiente | validado | rechazado)

kyb_reviews
  id (uuid, pk)
  business_id (fk businesses)
  reviewer_id (fk profiles)
  decision (enum: aprobado | rechazado)
  notas (text)
  created_at (timestamptz)
```

### 4.2 Pagos Pey
```
pey_accounts
  id (uuid, pk)
  business_id (fk businesses)
  pey_bank_account_id (text)       -- id de cuenta CoDi en Pey
  pey_api_key_ref (text)           -- referencia al secreto (no el secreto)
  estado (enum: en_registro | activa | suspendida)

charges
  id (uuid, pk)
  business_id (fk businesses)
  cajero_id (fk profiles, nullable)
  customer_id (fk customers, nullable)
  monto (numeric)
  descuento_puntos (numeric, default 0)
  tipo (enum: qr | push)
  pey_charge_id (text, nullable)
  estado (enum: pendiente | pagado | expirado | cancelado)
  idempotency_key (text, unique)
  paid_at (timestamptz, nullable)
```

### 4.3 Lealtad
```
customers
  id (uuid, pk)
  email (text, unique)             -- identidad del cliente
  nombre (text, nullable)
  nivel (enum: nuevo | confianza | vip, default nuevo)

point_rules
  id (uuid, pk)
  business_id (fk businesses)
  porcentaje (numeric)             -- % del monto -> puntos
  tope_puntos (numeric, nullable)
  vigencia_dias (int, nullable)
  activo (bool)

point_transactions            -- LEDGER inmutable
  id (uuid, pk)
  customer_id (fk customers)
  business_id (fk businesses)
  charge_id (fk charges, nullable)
  tipo (enum: acumulacion | canje | ajuste | expiracion)
  puntos (numeric)                 -- + acumula, - canjea
  saldo_resultante (numeric)       -- snapshot para auditoría
  created_at (timestamptz)
```

**Saldo de puntos** = se calcula del ledger (o vista materializada), nunca un campo mutable.

---

## 5. Seguridad y RLS

- **Políticas RLS** por `org_id` + `role` en todas las tablas de negocio. `admin_red` tiene política global.
- **Secretos** (API keys de Pey, service role de Supabase) viven en variables de entorno del Worker, nunca en el cliente.
- **Storage KYB:** bucket privado; solo dueño del negocio (subir) y admin (leer) según políticas.
- **Webhooks Pey:** verificar firma/secreto compartido; procesar con `idempotency_key` para no duplicar.
- **Aviso de privacidad** y consentimiento del cliente al registrar email (LFPDPPP).

---

## 6. Integración Pey (contrato interno)

Abstracción `PaymentProvider` para no acoplar el dominio a Pey:
```ts
interface PaymentProvider {
  registerCodiAccount(input): Promise<{ bankAccountId: string; estado: string }>
  getCodiAccountStatus(bankAccountId): Promise<{ estado: string }>
  createQrCharge(input: { bankAccountId; monto; idempotencyKey }): Promise<{ chargeId; qrPayload }>
  createPushCharge(input: { bankAccountId; monto; telefono; idempotencyKey }): Promise<{ chargeId }>
}
```
- `PeyProvider` (real) y `MockPeyProvider` (dev, sin sandbox de Pey).
- Flag de entorno `PAYMENTS_PROVIDER=pey|mock`.
- Webhook handler: endpoint server que recibe el evento CoDi, valida, busca `charge` por `pey_charge_id`/`idempotency_key`, marca `pagado`, crea `transaction` de ingreso y dispara acumulación de puntos.

---

## 7. Geocodificación (mapa)

- Al **aprobar** un negocio, el server geocodifica `direccion + cp` con Nominatim (User-Agent identificable, 1 req/s) y guarda `lat/lng`.
- El mapa público lee `businesses` con `estado_kyb=aprobado AND activo=true`; MapLibre pinta pines desde las coordenadas ya guardadas.
- Fallback: si Nominatim no resuelve, el negocio queda aprobado pero "sin ubicar"; el admin puede ajustar el pin a mano.

---

## 8. Entornos y despliegue

| Entorno | Front/Server | Supabase | Pey |
|---------|--------------|----------|-----|
| Local (dev) | `bun dev` | proyecto Supabase cloud (o `supabase start`) | `MockPeyProvider` |
| Producción | Cloudflare Workers | Supabase cloud | `PeyProvider` real |

- Variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE`, `PEY_API_KEY`, `PEY_WEBHOOK_SECRET`, `PAYMENTS_PROVIDER`, `NOMINATIM_USER_AGENT`.
- CI: build + `vitest` + lint; deploy a Cloudflare en merge a `main`.

---

## 9. Decisiones técnicas abiertas (ADR pendientes)
- Cálculo de saldo de puntos: vista materializada vs. agregación on-the-fly (empezar con agregación).
- Multi-sucursal por negocio (¿una `org` = un local, o soportar varias sucursales?).
- Expiración de puntos: job programado vs. cálculo perezoso.
- PWA/offline para caja con mala conexión.
