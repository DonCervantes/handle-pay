# Handle — Documentación del proyecto

Capa de cobros CoDi + lealtad para changarros tradicionales en México.
Construido sobre el repo base `handle-finanzas-central`, integrando **Pey** para pagos CoDi.

## Índice

| # | Documento | Qué contiene |
|---|-----------|--------------|
| 00 | [PRD](00-PRD.md) | Requerimientos de producto: problema, usuarios, alcance, épicas, riesgos. |
| 01 | [TDR](01-TDR.md) | Diseño técnico: stack, modelo de datos, seguridad, integración Pey, despliegue. |
| 02 | [Arquitectura de backend](02-arquitectura-backend.md) | Diagramas: componentes, ER, secuencias (cobro, KYB), roles. |
| 03 | [Landing](03-landing.md) | Copy de la landing principal, slogan y guía visual. |
| 04 | [Backlog de tickets](04-backlog-tickets.md) | Tickets de lo elemental a futuros features (HND-###). |

## Stack (resumen)

- **Front/Server:** TanStack Start + React + TS → Cloudflare Workers
- **UI:** Tailwind + shadcn/ui
- **Datos/Auth/Storage:** Supabase (Postgres + RLS)
- **Pagos:** Pey (CoDi QR + push)
- **Mapa:** MapLibre GL JS + OSM/Nominatim
- **Login:** email / magic link (todos los roles)

## Principios

1. Handle **no custodia dinero** — Pey es el procesador licenciado (fuera de Ley Fintech).
2. Los **puntos son descuentos**, no efectivo ni transferibles.
3. Multi-tenant por `org_id` con RLS en todo.
4. Secretos solo server-side.
5. Mobile-first: el changarrero y el cliente entran desde el celular.

## Cómo empezar (dev local)

1. `bun install`
2. Copiar `.env.example` a `.env` y rellenar los valores del proyecto Supabase (`handle-pey`, ref `eilyixikcuwukejtbjgo`). La `SUPABASE_SERVICE_ROLE_KEY` se obtiene en el dashboard: Project Settings → API Keys. Nunca se commitea `.env`.
3. `bun dev` → http://localhost:8080
4. Trabajar los tickets en orden desde `04-backlog-tickets.md` (empezar por HND-001).
