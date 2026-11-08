<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Multi-tenancy: every app table is scoped by `org_id` via RLS using `public.current_org_id()`; a BEFORE INSERT trigger fills `org_id`, so client inserts omit it. Why: one org per signup, isolation enforced in the database.
- Signup trigger `handle_new_user` creates the organization, the owner profile and calls `seed_demo_data(org)`. Why: new accounts see realistic data immediately.
- Profile `role` is only writable by service role (column-level grant on `full_name` only). Why: prevent self privilege escalation.
- App pages live under `src/routes/_authenticated/` and read data with the browser client + TanStack Query (`src/lib/data.ts`). Why: RLS-scoped reads, client-only gate.
- Access rules live only in `src/lib/roles.ts` (deny by default; public routes in `RUTAS_PUBLICAS`); every server function starts with `exigirRol(...)` (`src/lib/autorizacion.ts`). Why: a test fails if a route has no rule.
- CoDi charges run in TanStack server functions (`src/lib/cobros.functions.ts`), not Edge Functions, through the `ProveedorPagos` interface (`src/lib/pagos/`): `PAYMENTS_PROVIDER=mock` uses the simulator (default), `pey` the real Pey API (no sandbox: real money). Why: the domain never depends on the provider.
- Pey webhooks arrive at `/api/webhooks/pey`, signed with Standard Webhooks and idempotent by webhook-id (`src/lib/pagos/webhook.server.ts`); payments reconcile atomically with `registrar_pago_pey()` (service_role only). Never update `charges.estado` or `descuento_puntos` directly from TS: use `cerrar_cobro()` / `aplicar_canje()`.
- Loyalty points: the `point_transactions` ledger is immutable and only written by SQL functions as service_role. Points are a discount valid only at the business where they were earned; they are not cash.
- The public map reads `negocios_publicos()` (security definer, whitelist of columns: never RFC, CURP, phone or bank data). MapLibre loads only on the client.
- AI calls go through `groqChat` + `runAgent` in `src/lib/ai.server.ts` (Groq OpenAI-compatible API, key GROQ_API_KEY); every call is logged to `agent_runs` via the user's RLS client. Assistant context is built server-side from the caller's org only.
- Outbound automation uses `emitN8nEvent` (`n8n.server.ts`, N8N_WEBHOOK_URL): never throws, 5s timeout, no-op when unset. Why: automation must never block or revert a payment.
- Directory filtering and client statement selection live in browser-safe pure helpers; URL search parameters preserve filters across navigation.
- Shared table feedback and route metadata helpers keep loading, empty, error and social-preview states consistent without altering payment or AI workflows.
- Handle API v1 routes live under src/routes/api/v1; they authenticate with hashed org API keys (api-keys.server.ts) and query with the admin client filtered by the key's org_id. Why: external callers have no user session.
