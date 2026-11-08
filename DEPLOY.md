# DEPLOY · Handle en Cloudflare Workers (HND-062)

Runbook para el primer deploy público y los siguientes. Cada paso dice **quién** lo hace, **qué
comando** corre y **cómo se verifica**. Todos los scripts del repo corren en **simulación** por
defecto y solo actúan con `--aplicar`.

**Estado de las decisiones (2026-11-07):**
- **Hosting:** aún no decidido. Este runbook sigue el camino preparado en el repo, **Cloudflare
  Workers**. Al final hay una sección corta "Alternativa: publicar desde Lovable".
- **Dominio:** se empieza con el subdominio gratis de Cloudflare
  **`handle-pay.<cuenta>.workers.dev`** (abajo `<URL>` = `https://handle-pay.<cuenta>.workers.dev`).
  El paso 6 explica cómo pasar después a un dominio propio.
- **SMTP:** se decide después. El paso 4 es genérico (Resend como ejemplo) y explica por qué el
  remitente necesita un dominio propio aunque la app viva en `workers.dev`.

| Pieza | Dónde vive | Qué hace |
|---|---|---|
| CI | `.github/workflows/ci.yml` ("CI") | En cada PR y push a `main`: Vitest, `tsc`, build y `verificar:bundle`. Sin secretos. |
| Deploy | `.github/workflows/deploy.yml` ("Deploy a Cloudflare") | Solo manual. Modo `simulacion` (`wrangler deploy --dry-run`) o `desplegar` (solo desde `main`). Si faltan secrets/variables, el job queda omitido y el resumen dice cuáles. |
| Secretos del Worker | `scripts/cloudflare-secrets.mjs` (`bun run prod:secretos`) | Sube las variables de servidor de `.env.production` con `wrangler secret put` (por stdin, nunca en pantalla). |
| Supabase Auth | `scripts/supabase-auth-prod.mjs` (`bun run prod:auth`) | Site URL, Redirect URLs y SMTP vía Management API. `--comparar` solo lee. |
| Bundle | `scripts/verificar-bundle.mjs` (`bun run verificar:bundle`) | Sin secretos en `.output`, MapLibre fuera del servidor, tamaño del Worker < 3 MiB gzip. |
| Smoke | `scripts/smoke-prod.mjs` (`bun run smoke:prod -- <url>`) | `/`, `/mapa`, `/auth`, `/api/health`, webhook de Pey rechaza firmas inválidas y JS servido sin secretos. |
| Plantilla | `.env.production.example` | Todas las variables de producción. Se copia a `.env.production` (ignorado por git). |

> Usa siempre `npx bun …` si `bun` no está instalado globalmente. Ningún script imprime valores de
> secretos; aun así, no pegues la salida de `wrangler` ni de `.env.production` en chats.

---

## 0. Decisiones antes de empezar (Dylan)

- [x] **Dominio de arranque:** `handle-pay.<cuenta>.workers.dev` (gratis, sin DNS). `<cuenta>` es el
      subdominio `workers.dev` de la cuenta (Workers & Pages → barra lateral). En `.env.production`:
      `DOMINIO_PRODUCCION="handle-pay.<cuenta>.workers.dev"`.
- [ ] **Dominio propio** (después, opcional): ver paso 6.
- [ ] **Proveedor SMTP y dominio del remitente:** ver paso 4.
- [ ] **Proyecto de Supabase de producción.** Hoy desarrollo y E2E usan el proyecto compartido
      `handle-pey`. Si producción usa el mismo, cambiar la Site URL afecta los magic links de
      desarrollo (se mitiga con `REDIRECT_URLS_EXTRA`, ver paso 4) y los datos de prueba conviven con
      datos reales. Recomendado: proyecto nuevo y aplicar `supabase/migrations/` en orden.
- [ ] **Plan de Workers:** el Worker pesa ~0.8 MiB gzip (límite gratuito 3 MiB), así que el plan
      gratuito alcanza para arrancar. Si se cambia, ajustar `LIMITE_WORKER_MIB`.
- [ ] **Teselas del mapa:** hoy se piden directo a `tile.openstreetmap.org`, que no admite tráfico de
      producción. Antes de anunciar el mapa, cambiar a un proveedor (MapTiler, Stadia, Protomaps…).

## 1. Cuenta y token de Cloudflare (Dylan)

1. Crear/entrar a la cuenta en dash.cloudflare.com y anotar el **Account ID** (Workers & Pages →
   barra lateral derecha).
2. **Token para GitHub Actions:** My Profile → API Tokens → Create Token → plantilla
   **"Edit Cloudflare Workers"** → limitar a la cuenta (y a la zona del dominio si se gestiona la ruta
   con wrangler). Copiarlo una sola vez.
3. **Desde tu máquina** (para `prod:secretos` y `wrangler rollback`) hay dos opciones:
   - `npx wrangler@4.158.0 login` (abre el navegador; la sesión queda en tu equipo), o
   - exportar `CLOUDFLARE_API_TOKEN` y `CLOUDFLARE_ACCOUNT_ID` en la terminal (no en archivos versionados).
4. Verificar: `npx wrangler@4.158.0 whoami` muestra la cuenta correcta.

## 2. GitHub: secrets y variables (Dylan)

En el repo → Settings → Secrets and variables → Actions:

| Tipo | Nombre | Valor |
|---|---|---|
| Secret | `CLOUDFLARE_API_TOKEN` | Token del paso 1.2 |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | Account ID |
| Variable | `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` (pública por diseño) |
| Variable | `VITE_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` (pública por diseño) |
| Variable | `VITE_SUPABASE_PROJECT_ID` | `<ref>` |

Las `VITE_*` se **inyectan al compilar** en el JS del navegador; nunca pongas ahí la llave secreta.
Los secretos del Worker **no** van en GitHub: se suben con el paso 5.

Verificar: Actions → "Deploy a Cloudflare" → Run workflow → modo **`simulacion`**. Debe terminar en
verde con `wrangler deploy --dry-run`. Si el job "Build y deploy" sale *skipped*, el resumen del job
"Revisar secretos y variables" dice qué falta.

## 3. Preparar `.env.production` (Dylan, en tu máquina)

```bash
cp .env.production.example .env.production   # ignorado por git
```

Rellenar con los valores de **producción**. Dejar `PAYMENTS_PROVIDER="mock"` hasta el paso 9.
`PEY_WEBHOOK_SECRET` se llena en el paso 8 (el portal lo da al crear el webhook).

Validar sin tocar nada:

```bash
npx bun run prod:secretos          # simulación: valida y lista NOMBRES (sin valores)
npx bun run prod:auth              # simulación: muestra los cambios de Auth que haría
```

## 4. Correo: SMTP propio para los magic links (Dylan, decisión pendiente)

El SMTP incluido en Supabase solo envía a miembros del equipo y con un límite muy bajo: sin SMTP
propio los clientes **no reciben el magic link**. Hasta decidir el proveedor, la app puede
publicarse, pero solo entran cuentas del equipo de Supabase.

**Limitación de `workers.dev`:** el dominio `workers.dev` es de Cloudflare; no se le pueden agregar
registros DNS (SPF, DKIM, DMARC), así que **no sirve como remitente**. El remitente necesita un
**dominio propio verificado en el proveedor SMTP** (puede ser un dominio barato distinto al de la app,
p. ej. `mail.handle.mx`), aunque la app siga en `handle-pay.<cuenta>.workers.dev`. Cualquier
proveedor sirve si da estos datos:

| Variable en `.env.production` | Qué es | Ejemplo con Resend |
|---|---|---|
| `SMTP_HOST` | Servidor SMTP | `smtp.resend.com` |
| `SMTP_PORT` | 465 (SSL) o 587 (STARTTLS) | `465` |
| `SMTP_USER` | Usuario | `resend` |
| `SMTP_PASS` | Contraseña o API key de envío | API key con *Sending access* |
| `SMTP_REMITENTE` | Correo del remitente, **de un dominio verificado** | `no-responder@mail.handle.mx` |
| `SMTP_NOMBRE_REMITENTE` | Nombre visible | `Handle` |

Pasos (ejemplo con Resend; otros proveedores son equivalentes):

1. Agregar el dominio del remitente en el proveedor (Resend → Domains → Add domain).
2. Crear en el DNS de ese dominio los registros que indique el proveedor (si el DNS está en
   Cloudflare, los TXT/MX no se "proxean"):
   - **SPF:** TXT (en Resend, en `send.<dominio>` junto con un MX) con el `include:` que da el proveedor.
   - **DKIM:** TXT (en Resend, `resend._domainkey.<dominio>`) con la llave pública que da el proveedor.
   - **DMARC:** TXT `_dmarc.<dominio>` → empezar con `v=DMARC1; p=none; rua=mailto:dmarc@<dominio>`
     y, tras una o dos semanas sin rechazos, subir a `p=quarantine`.
3. Esperar a que el proveedor marque el dominio como verificado y crear la credencial SMTP.
4. Llenar las variables de la tabla y aplicar con `prod:auth` (paso 7).
5. Verificar con mail-tester.com o enviando a Gmail ("Mostrar original": SPF, DKIM y DMARC en **PASS**).

## 5. Primer deploy (Dylan)

Orden recomendado: **deploy → secretos → dominio**. `wrangler secret put` sobre un Worker que aún no
existe pide confirmación interactiva, por eso primero se crea el Worker.

1. Desplegar el código (con la app en `mock`):
   - **Opción A (recomendada):** mergear a `main` → Actions → "Deploy a Cloudflare" → Run workflow →
     modo **`desplegar`**.
   - **Opción B (local):** con las `VITE_*` de producción en el entorno,
     `npx bun run build && npx bun run verificar:bundle && npx wrangler@4.158.0 deploy`
     (el build deja `.wrangler/deploy/config.json` apuntando a `.output/server/wrangler.json`).
2. Wrangler imprime la `<URL>` (`https://handle-pay.<cuenta>.workers.dev`). Si la cuenta aún no
   tiene subdominio `workers.dev`, wrangler pide elegirlo la primera vez; ese nombre es `<cuenta>`. En este punto
   `/api/health` responde **503** con `faltan: [...]`: es lo esperado, aún no hay secretos.
3. Subir las variables de servidor:
   ```bash
   npx bun run prod:secretos              # simulación: revisar la lista
   npx bun run prod:secretos -- --aplicar # wrangler secret put por cada variable (crea una versión nueva)
   ```
   Sube `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYMENTS_PROVIDER`
   y las opcionales que tengan valor (`PEY_*`, `GROQ_*`, `N8N_WEBHOOK_URL`, `NOMINATIM_USER_AGENT`).
4. Verificar:
   ```bash
   npx bun run smoke:prod -- https://handle-pay.<cuenta>.workers.dev --pagos=mock
   ```
   Debe terminar en `N/N revisiones correctas` y salir con código 0.

## 6. Dominio propio (después, opcional)

Mientras tanto, todo apunta a `handle-pay.<cuenta>.workers.dev`. Para cambiar a `<dominio>`:

1. Agregar `<dominio>` como zona en Cloudflare (nameservers apuntando a Cloudflare).
2. Workers & Pages → `handle-pay` → Settings → **Domains & Routes** → Add → **Custom Domain** →
   `<dominio>` (Cloudflare crea el DNS y el certificado).
   - Alternativa versionada: agregar a `wrangler.jsonc`
     `"routes": [{ "pattern": "<dominio>", "custom_domain": true }]` y volver a desplegar. Si se usa
     el dashboard, no mezclar con rutas en el archivo.
3. `DOMINIO_PRODUCCION="<dominio>"` en `.env.production` y `npx bun run prod:auth -- --aplicar`:
   cambia la Site URL y **agrega** `https://<dominio>/auth` (la de `workers.dev` se conserva y puede
   borrarse a mano después en el dashboard).
4. En el portal de Pey, cambiar la URL del webhook a `https://<dominio>/api/webhooks/pey` (si el
   portal genera un secreto nuevo, actualizar `PEY_WEBHOOK_SECRET` y `prod:secretos --aplicar`).
5. Opcional: con el dominio propio también puedes verificar el remitente SMTP en él (paso 4).
6. Verificar: `npx bun run smoke:prod -- https://<dominio> --pagos=<modo>`.

## 7. Supabase Auth para el dominio (Dylan)

Necesita un token personal: supabase.com/dashboard/account/tokens → `SUPABASE_ACCESS_TOKEN` en
`.env.production` (o solo en el entorno de la terminal).

```bash
npx bun run prod:auth -- --comparar   # solo lee (GET): muestra valor actual → nuevo
npx bun run prod:auth -- --aplicar    # GET → PATCH → GET de verificación
```

Configura **Site URL** = `https://handle-pay.<cuenta>.workers.dev` (el valor de
`DOMINIO_PRODUCCION`), agrega `https://handle-pay.<cuenta>.workers.dev/auth` (más
`REDIRECT_URLS_EXTRA`, p. ej. `http://localhost:8080/auth` para seguir entrando en local) a las
Redirect URLs **sin borrar las existentes**, y el SMTP del paso 4.

> **Mientras el SMTP no esté decidido:** hoy `prod:auth` exige las variables `SMTP_*` y no avanza sin
> ellas. Para publicar antes, configura a mano en el dashboard de Supabase → Authentication → URL
> Configuration la Site URL y la Redirect URL de arriba, y corre `prod:auth` cuando haya SMTP.

Verificar:
- Dashboard de Supabase → Authentication → URL Configuration y SMTP Settings muestran lo esperado.
- En `<URL>/auth` pedir un magic link a un correo **externo** (no del equipo): llega en menos de un
  minuto, desde el remitente configurado, y el enlace regresa a `<URL>/auth`.
- Authentication → Rate Limits: con SMTP propio arranca en 30 correos/h; subirlo si hace falta
  (`SMTP_LIMITE_POR_HORA`).

## 8. Webhook de Pey (Dylan)

1. **Rotar primero la API key de Pey** (la de pruebas se compartió en una conversación; ver paso 11).
2. portal.mipey.mx → Desarrollador → engrane de la API key → crear webhook a
   `https://handle-pay.<cuenta>.workers.dev/api/webhooks/pey` con los eventos `codi.qr.payment_received`,
   `codi.pn.payment_received` y `bank.account.updated`.
3. Copiar el secreto `whsec_…` que muestra el portal a `PEY_WEBHOOK_SECRET` en `.env.production` y
   volver a correr `npx bun run prod:secretos -- --aplicar`.
4. Verificar: `npx bun run smoke:prod -- <URL>` (el webhook debe rechazar firmas
   inventadas con 401). En el portal, "Webhook Logs" no debe mostrar errores.
   No uses `--webhook-firmado` contra producción: escribe un evento de prueba en la base.

## 9. Pagos reales y pago de $0.01 (Dylan)

Con Pey **no hay sandbox**: `PAYMENTS_PROVIDER=pey` mueve dinero real.

1. En `.env.production`: `PAYMENTS_PROVIDER="pey"` y `PEY_API_KEY` (la rotada). Aplicar:
   `npx bun run prod:secretos -- --aplicar`.
2. Verificar el modo: `npx bun run smoke:prod -- <URL> --pagos=pey` (si falta
   `PEY_API_KEY` o `PEY_WEBHOOK_SECRET`, `/api/health` responde 503 y dice cuál).
3. Con un negocio real de prueba (cuenta CLABE propia, estado `activa`): en `/caja` crear un cobro de
   **$0.01**, escanear el QR con la app del banco y pagar.
4. Debe pasar, sin tocar nada: Pey manda `codi.qr.payment_received` → el cobro queda **pagado** en
   `/caja` y aparece el ingreso en `/finanzas`. Revisar en Supabase la tabla `pey_webhook_events`
   (fila con `procesado_at` y `resultado`) y los "Webhook Logs" del portal (respuesta 200).
5. Probar también el cobro push (`codi.pn.payment_received`) con otro $0.01.
6. Si algo falla: volver a `PAYMENTS_PROVIDER="mock"` + `prod:secretos --aplicar` (efecto inmediato)
   y revisar los logs del Worker (`npx wrangler@4.158.0 tail handle-pay` o Workers → Logs).

## 10. Deploys siguientes

1. PR → el workflow **CI** debe pasar.
2. Merge a `main` → Actions → "Deploy a Cloudflare" → `simulacion` (opcional) → `desplegar`.
3. `npx bun run smoke:prod -- <URL> --pagos=pey`.
4. Migraciones de base: se aplican **antes** del deploy que las necesita y deben ser compatibles con
   el código anterior (el rollback del Worker no deshace la base).

## 11. Rotación de llaves (Dylan)

Hacerla antes de abrir al público y cada vez que una llave se comparta por error. Siempre:
**crear la nueva → subirla → verificar → revocar la vieja**.

| Llave | Dónde se crea | Dónde se actualiza |
|---|---|---|
| `PEY_API_KEY` (`sk_live_…`) | portal.mipey.mx → Desarrollador | `.env.production` → `prod:secretos --aplicar`; `.env` local |
| `PEY_WEBHOOK_SECRET` | portal (al recrear el webhook) | `.env.production` → `prod:secretos --aplicar` |
| `SUPABASE_SERVICE_ROLE_KEY` (`sb_secret_…`) | Supabase → Project Settings → API Keys → nueva *secret key* | `.env.production` → `prod:secretos --aplicar`; `.env` local; después borrar la vieja. Si aún se usa la llave *legacy* JWT `service_role`, migrar a `sb_secret_` (rotar el JWT secret invalida todas las sesiones). |
| `GROQ_API_KEY` | console.groq.com → API Keys | `.env.production` → `prod:secretos --aplicar` |
| `SMTP_PASS` | panel del proveedor SMTP (p. ej. resend.com → API Keys) | `.env.production` → `prod:auth --aplicar` |
| `CLOUDFLARE_API_TOKEN` | Cloudflare → API Tokens → Roll | GitHub → Secrets |
| `SUPABASE_ACCESS_TOKEN` | supabase.com/dashboard/account/tokens | solo local; revocarlo al terminar |

Tras cada rotación: `npx bun run smoke:prod -- <URL> --pagos=<modo>`.
Para confirmar que ninguna llave quedó en el build: `node --env-file=.env.production scripts/verificar-bundle.mjs`
tras `bun run build` (compara los valores sin imprimirlos).

## 12. Rollback

El código se revierte en segundos; la base y la configuración externa **no**.

```bash
npx wrangler@4.158.0 deployments list --name handle-pay     # historial de deploys
npx wrangler@4.158.0 versions list --name handle-pay        # versiones disponibles
npx wrangler@4.158.0 rollback --name handle-pay --message "motivo"            # a la versión anterior
npx wrangler@4.158.0 rollback <VERSION_ID> --name handle-pay --message "motivo" # a una versión concreta
```

- `wrangler secret put` también crea versiones: si el problema fue un secreto, corregirlo y volver a
  correr `prod:secretos --aplicar` suele ser mejor que un rollback.
- **Pagos con problemas:** primero `PAYMENTS_PROVIDER="mock"` + `prod:secretos --aplicar` (deja de
  cobrar de verdad), luego investigar.
- Supabase Auth: `prod:auth -- --comparar` muestra la configuración actual; corregir el
  `.env.production` y volver a aplicar.
- Después de cualquier rollback: `npx bun run smoke:prod -- <URL>`.

## Lista final de aceptación (HND-062)

- [ ] CI verde en el PR; "Deploy a Cloudflare" en `desplegar` desde `main`.
- [ ] `smoke:prod -- <URL> --pagos=pey` → todas las revisiones correctas.
- [ ] SMTP decidido; magic link llega a un correo externo (SPF/DKIM/DMARC en PASS).
- [ ] Pago real de $0.01 conciliado por webhook (QR y push).
- [ ] Llaves de Pey y Supabase rotadas; tokens temporales revocados.
- [ ] Teselas del mapa en un proveedor apto para producción.

---

## Alternativa: publicar desde Lovable

El proyecto nació en Lovable (`@lovable.dev/vite-tanstack-config`), así que también puede publicarse
con el botón **Publish** de Lovable. Diferencias con el camino de Cloudflare de arriba:

| Tema | Cloudflare Workers (este runbook) | Lovable |
|---|---|---|
| Build y deploy | `deploy.yml` / `wrangler deploy`, desde `main` | Lovable compila y publica desde su copia del repo (sincronizada con GitHub) |
| Secretos del servidor (`SUPABASE_SERVICE_ROLE_KEY`, `PEY_*`, `GROQ_API_KEY`, `PAYMENTS_PROVIDER`…) | `prod:secretos --aplicar` | Se cargan a mano en los *secrets* del proyecto en Lovable; `prod:secretos` no aplica |
| Variables `VITE_*` | GitHub → Variables | Configuración del proyecto en Lovable |
| URL / dominio | `handle-pay.<cuenta>.workers.dev`, luego Custom Domain (paso 6) | `<proyecto>.lovable.app`; dominio propio desde la configuración del proyecto en Lovable (según el plan) |
| Rollback | `wrangler rollback` (paso 12) | Historial de versiones de Lovable |
| CI | `ci.yml` sigue aplicando a los PR | Igual (es de GitHub, no del hosting) |

Lo que **no cambia**: `<URL>` pasa a ser la de Lovable en Supabase Auth (`DOMINIO_PRODUCCION` +
`prod:auth`), en el webhook de Pey y en `smoke:prod`; el SMTP, el pago de $0.01, la rotación de llaves
y `verificar:bundle` son iguales. No mezclar: si se publica en Lovable, el webhook de Pey y la Site URL
deben apuntar a una sola URL.
