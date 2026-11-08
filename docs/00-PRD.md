# PRD — Handle

**Documento de Requerimientos de Producto (Product Requirements Document)**
Versión 0.1 · 2026-11-07 · Estado: Borrador

---

## 1. Resumen ejecutivo

**Handle** es una plataforma para digitalizar el cobro y la fidelización de **changarros tradicionales mexicanos** (abarrotes, tiendas, carnicerías, taquerías). Permite a estos negocios recibir pagos con **CoDi®** (vía QR o notificación push) a través de la infraestructura de **Pey**, y premiar a sus clientes de confianza con un **sistema de puntos y descuentos** que funciona en toda la red de negocios afiliados.

Una red de afiliados, administrada centralmente, da de alta negocios locales tras un proceso de **KYC/KYB** (verificación del negocio), y los publica en un **mapa real** de negocios recomendados.

### Propuesta de valor
- **Para el changarro:** cobra sin terminal/comisiones de tarjeta (CoDi es de bajo costo), fideliza clientes y aparece en un mapa que le trae gente nueva.
- **Para el cliente:** paga fácil desde su banco, acumula puntos en su tienda de la esquina y los usa en cualquier negocio de la red.
- **Para Handle (red):** cobra por afiliación/servicio sin mover dinero (Pey es el procesador licenciado), evitando la carga regulatoria de la Ley Fintech.

---

## 2. Problema

El pequeño comercio mexicano:
- Depende del **efectivo**: inseguro, difícil de contabilizar.
- No puede pagar terminales de tarjeta ni sus comisiones (~2-3.5%).
- No tiene herramientas de **lealtad** más allá de "la libreta del fiado".
- Es **invisible digitalmente**: no aparece en mapas ni directorios formales.

CoDi existe desde 2019 pero su adopción en changarros es baja por falta de herramientas simples encima de él. Handle es esa capa.

---

## 3. Objetivos y métricas

| Objetivo | Métrica (North Star y de apoyo) |
|----------|---------------------------------|
| Afiliar negocios | # de negocios con KYB aprobado y cuenta Pey activa |
| Generar transaccionalidad | # y monto de cobros CoDi liquidados / semana |
| Fidelización | % de cobros con cliente identificado; puntos canjeados |
| Red / descubrimiento | # de negocios en el mapa; vistas de perfil de negocio |

**North Star:** monto mensual cobrado vía CoDi a través de Handle.

---

## 4. Alcance

### Dentro del alcance (v1)
- Registro y login por **email / magic link** para todos los roles.
- **KYB** de negocios (revisión manual por admin de red) con expediente y documentos.
- Integración **Pey CoDi**: cobro por QR y por push, conciliación por webhook.
- **Motor de puntos** (acumulación y canje como descuento dentro de la red).
- **Mapa real** (MapLibre + OSM) de negocios recomendados, filtrable por categoría.
- Paneles por rol: Admin de red, Dueño de negocio, Cajero, Cliente.

### Fuera del alcance (v1)
- Pagos con tarjeta/Stripe (fase posterior).
- Puntos canjeables por efectivo o transferibles (riesgo regulatorio — excluido por diseño).
- Crédito / "fiado" formal (fase posterior, con análisis legal).
- App móvil nativa (v1 es web responsive / PWA).
- Módulo on-chain/Stellar del repo base (se archiva, no se usa en cobros reales).

---

## 5. Usuarios y roles (personas)

1. **Admin de red (Handle):** aprueba/rechaza expedientes KYB, marca negocios como recomendados, gestiona el mapa y ve la salud de la red.
2. **Dueño de negocio (Doña Mari, abarrotes):** completa su expediente, conecta su cuenta Pey, define reglas de puntos, administra a sus cajeros y ve ventas del día.
3. **Cajero/empleado:** genera cobros (QR/push), identifica al cliente y canjea puntos. No ve reportes financieros.
4. **Cliente final (Luis, vecino):** paga con su banco, acumula puntos y los usa en la red; consulta el mapa.

---

## 6. Requerimientos funcionales (épicas)

### E1. Autenticación y roles
- RF1.1 Alta e inicio de sesión por email / magic link.
- RF1.2 Cada usuario tiene `role` y pertenece a una `org` (salvo admin de red = global).
- RF1.3 RLS: cada quien ve solo lo que su rol y `org_id` permiten.

### E2. KYB / onboarding de negocios
- RF2.1 Formulario de alta: datos fiscales (RFC), razón social/persona física, categoría, domicilio, titular de cuenta.
- RF2.2 Subida de documentos (INE, constancia de situación fiscal, comprobante de domicilio, titularidad de cuenta).
- RF2.3 Validaciones automáticas de formato: RFC, CURP, código postal.
- RF2.4 Flujo de estados: `borrador → en_revisión → aprobado/rechazado`.
- RF2.5 Admin revisa, aprueba/rechaza con notas; queda bitácora (auditoría).
- RF2.6 Solo un negocio **aprobado** puede activar cobros.

### E3. Pagos con Pey (CoDi)
- RF3.1 Conectar cuenta de cobro CoDi del negocio (manejar estado "en registro ~5 días hábiles").
- RF3.2 Generar cobro por **QR** CoDi (monto fijo o abierto).
- RF3.3 Generar cobro por **push** CoDi.
- RF3.4 Recibir webhook de pago, **idempotente**, y marcar el cobro como pagado.
- RF3.5 Registrar automáticamente el ingreso del negocio.

### E4. Lealtad / puntos
- RF4.1 Reglas de puntos por negocio (porcentaje, tope, vigencia).
- RF4.2 Acumular puntos al confirmarse un cobro con cliente identificado.
- RF4.3 Canjear puntos como **descuento** en un cobro.
- RF4.4 Ledger inmutable de movimientos de puntos (sin saldo mutable).
- RF4.5 Niveles de cliente (`nuevo/confianza/vip`) que ajustan beneficios.

### E5. Mapa y descubrimiento
- RF5.1 Geocodificar el domicilio del negocio al aprobarlo (Nominatim) y guardar lat/lng.
- RF5.2 Mapa público con pines de negocios aprobados y `recomendado`.
- RF5.3 Filtro por categoría (abarrotes, carnicería, taquería, etc.).
- RF5.4 Perfil público del negocio (horario, categoría, promos).

### E6. Paneles por rol
- RF6.1 Admin: cola de KYB, gestión de recomendados, salud de red.
- RF6.2 Dueño: dashboard de ventas del día, reglas de puntos, equipo.
- RF6.3 Cajero: pantalla de cobro y canje, mínima y rápida.
- RF6.4 Cliente: monedero de puntos, historial y mapa.

---

## 7. Requerimientos no funcionales
- **Seguridad:** claves de Pey y Supabase solo server-side; RLS en todas las tablas; documentos KYB en bucket privado.
- **Privacidad:** capturar el mínimo dato personal del cliente; cumplir aviso de privacidad (LFPDPPP).
- **Confiabilidad de pagos:** webhooks idempotentes; todo cobro mostrado debe conciliar con un evento real de Pey.
- **Rendimiento:** mapa no debe geocodificar en cada carga (coordenadas precalculadas).
- **Despliegue:** Cloudflare Workers; desarrollo local con paridad de entorno.

---

## 8. Riesgos y mitigaciones

| Riesgo | Mitigación |
|--------|-----------|
| Regulación (mover dinero = Ley Fintech/IFPE) | Pey es el procesador licenciado; Handle no custodia fondos. |
| Puntos tratados como "valor almacenado" | Puntos = solo descuento, no canjeables a efectivo ni transferibles. |
| Pey sin sandbox | `MockPeyProvider` en dev; pruebas con cuenta de prueba / $0.01. |
| Alta de cuenta CoDi tarda ~5 días | Estado "en registro" explícito en el onboarding. |
| Baja adopción del changarro | Pantalla de cobro ultra simple; valor inmediato (mapa + clientes). |
| Rate limit de Nominatim | Geocodificar 1 vez al aprobar, no por usuario. |

---

## 9. Supuestos
- Cada negocio = una `organization` en Handle.
- Los clientes finales aceptan identificarse con email para acumular puntos.
- Pey soporta múltiples cuentas CoDi vinculadas a API keys (una por negocio).
