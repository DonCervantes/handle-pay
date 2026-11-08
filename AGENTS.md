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
- Stellar payments run in TanStack server functions (`src/lib/payments.functions.ts`), not Edge Functions; Stellar helpers in `stellar.server.ts` use `@stellar/stellar-base` + Horizon via fetch (worker-safe, no full SDK). TESTNET only.
- Org custody secret keys live in `org_wallets` (RLS on, no client grants); read only with the admin client inside handlers, never returned. Confirmation goes through `finalize_payment()` (service_role only) to atomically mark confirmed, insert the expense and debit the wallet account.
- Quotes go through the `QuoteProvider` interface in `quote.server.ts`; swap the fixed-rate stub for Etherfuse there.
- AI calls go through `groqChat` + `runAgent` in `src/lib/ai.server.ts` (Groq OpenAI-compatible API, key GROQ_API_KEY); every call is logged to `agent_runs` via the user's RLS client. Assistant context is built server-side from the caller's org only.
- Outbound automation uses `emitN8nEvent` (`n8n.server.ts`, N8N_WEBHOOK_URL): never throws, 5s timeout, no-op when unset. Why: automation must never block or revert a payment.
- Directory filtering and client statement selection live in browser-safe pure helpers; URL search parameters preserve filters across navigation.
- Shared table feedback and route metadata helpers keep loading, empty, error and social-preview states consistent without altering payment or AI workflows.
- Handle API v1 routes live under src/routes/api/v1; they authenticate with hashed org API keys (api-keys.server.ts) and query with the admin client filtered by the key's org_id. Why: external callers have no user session.
