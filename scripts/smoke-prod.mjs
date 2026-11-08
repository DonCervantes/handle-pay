#!/usr/bin/env node
// HND-062 · Verificación post-deploy (solo lectura salvo --webhook-firmado).
//
//   node scripts/smoke-prod.mjs https://handle.example.mx
//   node scripts/smoke-prod.mjs https://handle.example.mx --pagos=pey
//   bun run smoke:prod -- http://127.0.0.1:8787 --webhook-firmado   (solo local, ver abajo)
//
// Revisa:
//  1. /, /mapa y /auth responden 200 con HTML.
//  2. /api/health responde 200 con ok=true (con --pagos=pey|mock exige ese modo) y no
//     contiene nada con forma de secreto.
//  3. El webhook de Pey (/api/webhooks/pey) rechaza con 401: sin encabezados, con firma
//     inventada y con una firma válida pero con timestamp viejo. GET responde 405.
//  4. Ningún JS servido al navegador (scripts y modulepreload de las páginas) contiene
//     secretos: patrones conocidos (sb_secret_, gsk_, whsec_, JWT service_role) y, si están
//     en el entorno, los VALORES de las variables secretas. Nunca imprime valores.
//
// --webhook-firmado: además manda un evento de prueba (tipo "handle.smoke", que el
// webhook ignora) firmado con PEY_WEBHOOK_SECRET del entorno y espera 200. Eso ESCRIBE
// una fila en pey_webhook_events: úsalo solo contra un servidor local o una base de prueba.
//
// Sale con código 0 si todo pasa, 1 si algo falla y 2 si el uso es incorrecto.
import { createHmac, randomUUID } from "node:crypto";

const args = process.argv.slice(2);
const base = args.find((a) => !a.startsWith("--"));
const opcion = (nombre) => args.find((a) => a.startsWith(`--${nombre}=`))?.split("=")[1];
const bandera = (nombre) => args.includes(`--${nombre}`);

if (!base || bandera("ayuda") || bandera("help")) {
  console.error("Uso: node scripts/smoke-prod.mjs <url> [--pagos=pey|mock] [--webhook-firmado]");
  process.exit(2);
}
let origen;
try {
  origen = new URL(base).origin;
} catch {
  console.error(`URL inválida: ${base}`);
  process.exit(2);
}
const pagosEsperado = opcion("pagos");
if (pagosEsperado && !["pey", "mock"].includes(pagosEsperado)) {
  console.error("--pagos debe ser pey o mock");
  process.exit(2);
}
const TIEMPO_MS = Number(process.env.SMOKE_TIMEOUT_MS ?? 15000);

const SECRETOS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "PEY_API_KEY",
  "PEY_WEBHOOK_SECRET",
  "GROQ_API_KEY",
  "N8N_WEBHOOK_URL",
  "LOVABLE_CRON_SECRET",
  "LOVABLE_CRON_SECRET_PREVIOUS",
];
const PATRONES = [
  ["llave secreta de Supabase (sb_secret_)", /sb_secret_[A-Za-z0-9_-]{10,}/],
  ["llave de Groq (gsk_)", /gsk_[A-Za-z0-9]{20,}/],
  ["secreto de webhook (whsec_)", /whsec_[A-Za-z0-9+/=]{16,}/],
];
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;

function rolDeJwt(token) {
  try {
    return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"))?.role ?? null;
  } catch {
    return null;
  }
}

/** Lista de problemas (sin valores) si el texto parece contener secretos. */
function buscarSecretos(texto) {
  const hallazgos = [];
  for (const nombre of SECRETOS) {
    const valor = process.env[nombre]?.trim();
    if (valor && valor.length >= 8 && texto.includes(valor)) hallazgos.push(`valor de ${nombre}`);
  }
  for (const [descripcion, patron] of PATRONES) if (patron.test(texto)) hallazgos.push(descripcion);
  for (const [token] of texto.matchAll(JWT)) {
    if (rolDeJwt(token) === "service_role") hallazgos.push("JWT con role=service_role");
  }
  return hallazgos;
}

function firmar(secreto, id, ts, cuerpo) {
  const llave = Buffer.from(secreto.startsWith("whsec_") ? secreto.slice(6) : secreto, "base64");
  return `v1,${createHmac("sha256", llave).update(`${id}.${ts}.${cuerpo}`).digest("base64")}`;
}

async function pedir(ruta, init = {}) {
  return fetch(new URL(ruta, origen), {
    redirect: "manual",
    signal: AbortSignal.timeout(TIEMPO_MS),
    ...init,
    headers: { "User-Agent": "handle-smoke/1.0", ...init.headers },
  });
}

const resultados = [];
async function revisar(nombre, prueba) {
  try {
    const detalle = await prueba();
    resultados.push({ nombre, ok: true, detalle });
    console.log(`  ok    ${nombre}${detalle ? ` · ${detalle}` : ""}`);
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    resultados.push({ nombre, ok: false, detalle: mensaje });
    console.log(`  FALLA ${nombre} · ${mensaje}`);
  }
}
function exigir(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje);
}

console.log(`Smoke contra ${origen}`);

// 1. Páginas públicas. Se guarda el HTML para buscar el JS que se sirve.
const paginas = new Map();
for (const ruta of ["/", "/mapa", "/auth"]) {
  await revisar(`GET ${ruta}`, async () => {
    const r = await pedir(ruta);
    exigir(r.status === 200, `status ${r.status}`);
    exigir((r.headers.get("content-type") ?? "").includes("text/html"), "no es HTML");
    const html = await r.text();
    paginas.set(ruta, html);
    const hallazgos = buscarSecretos(html);
    exigir(hallazgos.length === 0, `el HTML contiene: ${hallazgos.join(", ")}`);
    return `${(html.length / 1024).toFixed(0)} KB`;
  });
}

// 2. Salud.
await revisar("GET /api/health", async () => {
  const r = await pedir("/api/health");
  const texto = await r.text();
  let salud;
  try {
    salud = JSON.parse(texto);
  } catch {
    throw new Error(`status ${r.status}, no es JSON`);
  }
  exigir(buscarSecretos(texto).length === 0, "la respuesta contiene algo con forma de secreto");
  exigir(r.status === 200 && salud.ok === true, `status ${r.status}, faltan: ${(salud.faltan ?? []).join(", ") || "?"}`);
  if (pagosEsperado) exigir(salud.pagos === pagosEsperado, `pagos=${salud.pagos}, se esperaba ${pagosEsperado}`);
  // T14: el modo demo (entrar sin correo) jamás debe estar encendido en producción.
  exigir(salud.demo !== true, "el modo demo está encendido (DEMO_MODE)");
  return `pagos=${salud.pagos}, demo=${salud.demo === true ? "sí" : "no"}`;
});

// 3. El webhook de Pey no acepta nada sin firma válida.
const RUTA_WEBHOOK = "/api/webhooks/pey";
const eventoFalso = JSON.stringify({ type: "handle.smoke", origen: "smoke-prod" });
const ahora = () => Math.floor(Date.now() / 1000);
const webhook = (encabezados, cuerpo = eventoFalso) =>
  pedir(RUTA_WEBHOOK, {
    method: "POST",
    body: cuerpo,
    headers: { "Content-Type": "application/json", ...encabezados },
  });

await revisar("webhook sin encabezados → 401", async () => {
  const r = await webhook({});
  exigir(r.status === 401, `status ${r.status}`);
});
await revisar("webhook con firma inventada → 401", async () => {
  const r = await webhook({
    "webhook-id": `msg_smoke_${randomUUID()}`,
    "webhook-timestamp": String(ahora()),
    "webhook-signature": `v1,${Buffer.from(randomUUID()).toString("base64")}`,
  });
  exigir(r.status === 401, `status ${r.status}`);
});
await revisar("webhook firmado con otro secreto → 401", async () => {
  const id = `msg_smoke_${randomUUID()}`;
  const ts = ahora();
  const otro = `whsec_${Buffer.from(randomUUID()).toString("base64")}`;
  const r = await webhook({
    "webhook-id": id,
    "webhook-timestamp": String(ts),
    "webhook-signature": firmar(otro, id, ts, eventoFalso),
  });
  exigir(r.status === 401, `status ${r.status}`);
});
await revisar("GET al webhook → 405", async () => {
  const r = await pedir(RUTA_WEBHOOK);
  exigir(r.status === 405, `status ${r.status}`);
});

const secretoWebhook = process.env.PEY_WEBHOOK_SECRET?.trim();
if (secretoWebhook && secretoWebhook !== "whsec_...") {
  await revisar("webhook con firma correcta pero timestamp de hace 10 min → 401", async () => {
    const id = `msg_smoke_${randomUUID()}`;
    const ts = ahora() - 600;
    const r = await webhook({
      "webhook-id": id,
      "webhook-timestamp": String(ts),
      "webhook-signature": firmar(secretoWebhook, id, ts, eventoFalso),
    });
    exigir(r.status === 401, `status ${r.status}`);
  });
}
if (bandera("webhook-firmado")) {
  await revisar("webhook firmado de prueba → 200 (ignorado)", async () => {
    exigir(secretoWebhook, "falta PEY_WEBHOOK_SECRET en el entorno");
    const id = `msg_smoke_${randomUUID()}`;
    const ts = ahora();
    const r = await webhook({
      "webhook-id": id,
      "webhook-timestamp": String(ts),
      "webhook-signature": firmar(secretoWebhook, id, ts, eventoFalso),
    });
    const texto = await r.text();
    exigir(r.status === 200, `status ${r.status}`);
    exigir(JSON.parse(texto).resultado === "ignorado", `respuesta inesperada: ${texto.slice(0, 120)}`);
    return `id ${id}`;
  });
}

// 4. JS servido al navegador.
await revisar("JS del navegador sin secretos", async () => {
  const urls = new Set();
  const ATRIBUTOS = /<(?:script|link)\b[^>]*?\s(?:src|href)=["']([^"']+\.m?js(?:\?[^"']*)?)["']/gi;
  for (const html of paginas.values()) {
    for (const [, ref] of html.matchAll(ATRIBUTOS)) {
      const url = new URL(ref, origen);
      if (url.origin === origen) urls.add(url.href);
    }
  }
  exigir(urls.size > 0, "no se encontró ningún <script> o modulepreload en las páginas");
  const problemas = [];
  let bytes = 0;
  for (const url of urls) {
    const r = await fetch(url, { signal: AbortSignal.timeout(TIEMPO_MS) });
    if (r.status !== 200) {
      problemas.push(`${new URL(url).pathname}: status ${r.status}`);
      continue;
    }
    const texto = await r.text();
    bytes += texto.length;
    const hallazgos = buscarSecretos(texto);
    if (hallazgos.length) problemas.push(`${new URL(url).pathname}: ${hallazgos.join(", ")}`);
  }
  exigir(problemas.length === 0, problemas.join("; "));
  const comparados = SECRETOS.filter((n) => (process.env[n]?.trim().length ?? 0) >= 8).length;
  return `${urls.size} archivos, ${(bytes / 1024).toFixed(0)} KB, ${comparados} valores de secretos comparados`;
});

const fallas = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - fallas.length}/${resultados.length} revisiones correctas.`);
process.exit(fallas.length ? 1 : 0);
