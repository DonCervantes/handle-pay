# Bitácora de cambios — Handle

Registro vivo de lo que se va haciendo, para que quien siga tenga el contexto sin preguntar.
Lo más reciente va arriba. El estado general y el plan completo están en
[`docs/05-estado-del-proyecto.md`](docs/05-estado-del-proyecto.md) y los tickets en
[`docs/04-backlog-tickets.md`](docs/04-backlog-tickets.md).

**Cómo usar este archivo:** cada vez que subas cambios, agrega una entrada arriba con fecha,
rama, qué cambió, cómo se verificó y qué queda pendiente o bloqueado.

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
