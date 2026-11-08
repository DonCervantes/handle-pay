#!/usr/bin/env node
// HND-062 · Configura Supabase Auth para producción con el Management API:
// Site URL, Redirect URLs (https://<dominio>/auth) y SMTP propio (p. ej. Resend).
//
//   node scripts/supabase-auth-prod.mjs                 # SIMULACIÓN (por defecto): no llama a la API
//   node scripts/supabase-auth-prod.mjs --comparar      # simulación + lee la config actual (solo GET)
//   node scripts/supabase-auth-prod.mjs --aplicar       # lee la config actual, combina y hace PATCH
//   node scripts/supabase-auth-prod.mjs --env otra.env  # otro archivo (por defecto .env.production)
//
// Variables (en .env.production; SUPABASE_ACCESS_TOKEN también puede venir del entorno):
//   SUPABASE_PROJECT_ID, SUPABASE_ACCESS_TOKEN (supabase.com/dashboard/account/tokens),
//   DOMINIO_PRODUCCION (sin https://), REDIRECT_URLS_EXTRA (opcional, separadas por coma),
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_REMITENTE, SMTP_NOMBRE_REMITENTE,
//   SMTP_LIMITE_POR_HORA (opcional).
// Nunca imprime el token ni la contraseña SMTP.
// --sin-smtp: no toca el SMTP (solo Site URL y Redirect URLs).
import { describir, leerArchivoEnv, leerBanderas, ocultar } from "./lib/entorno.mjs";

const API = (process.env.SUPABASE_MANAGEMENT_API ?? "https://api.supabase.com").replace(/\/+$/, "");

const banderas = leerBanderas();
const comparar = banderas.resto.includes("--comparar");
if (banderas.ayuda) {
  console.log(
    "Uso: node scripts/supabase-auth-prod.mjs [--comparar] [--aplicar] [--env .env.production]",
  );
  process.exit(0);
}

let archivo;
try {
  archivo = leerArchivoEnv(banderas.env);
} catch (e) {
  console.error(e.message);
  process.exit(2);
}
const v = (n) => archivo[n]?.trim() || process.env[n]?.trim() || "";

// --- Validación ---
const errores = [];
const ref = v("SUPABASE_PROJECT_ID");
const token = v("SUPABASE_ACCESS_TOKEN");
const dominio = v("DOMINIO_PRODUCCION")
  .replace(/^https?:\/\//, "")
  .replace(/\/+$/, "");
if (!/^[a-z0-9]{20}$/.test(ref)) errores.push("SUPABASE_PROJECT_ID no parece un project ref (20 caracteres a-z0-9).");
if (!dominio || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(dominio))
  errores.push("DOMINIO_PRODUCCION falta o no es un dominio (ej. handle.mx, sin https://).");
if (/localhost|127\.0\.0\.1/.test(dominio)) errores.push("DOMINIO_PRODUCCION no puede ser localhost.");

// --sin-smtp: configura solo Site URL y Redirect URLs (mientras no haya proveedor de correo).
const sinSmtp = process.argv.includes("--sin-smtp");
const OBLIGATORIAS_SMTP = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_REMITENTE"];
if (!sinSmtp) for (const n of OBLIGATORIAS_SMTP) if (!v(n)) errores.push(`${n} falta o está vacía.`);
if (v("SMTP_PORT") && !/^\d+$/.test(v("SMTP_PORT"))) errores.push("SMTP_PORT debe ser un número (465 o 587).");
if (!sinSmtp && v("SMTP_REMITENTE") && dominio && !v("SMTP_REMITENTE").toLowerCase().endsWith(`@${dominio.toLowerCase()}`))
  console.warn(
    `Aviso: SMTP_REMITENTE no es del dominio ${dominio}; debe ser un dominio verificado en el proveedor SMTP (SPF/DKIM).`,
  );
const limite = v("SMTP_LIMITE_POR_HORA");
if (limite && !/^\d+$/.test(limite)) errores.push("SMTP_LIMITE_POR_HORA debe ser un número.");
if ((banderas.aplicar || comparar) && !token)
  errores.push("SUPABASE_ACCESS_TOKEN falta (necesario para --aplicar o --comparar).");

if (errores.length) {
  console.error("No se puede continuar:\n" + errores.map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}

// --- Cambios deseados ---
const siteUrl = `https://${dominio}`;
const redirects = [
  `${siteUrl}/auth`,
  ...v("REDIRECT_URLS_EXTRA")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
];
const cambios = sinSmtp ? { site_url: siteUrl } : {
  site_url: siteUrl,
  smtp_host: v("SMTP_HOST"),
  smtp_port: v("SMTP_PORT"),
  smtp_user: v("SMTP_USER"),
  smtp_pass: v("SMTP_PASS"),
  smtp_admin_email: v("SMTP_REMITENTE"),
  smtp_sender_name: v("SMTP_NOMBRE_REMITENTE") || "Handle",
  ...(limite ? { rate_limit_email_sent: Number(limite) } : {}),
};
const SECRETOS = [token, v("SMTP_PASS")];
const mostrar = (k, val) => (k === "smtp_pass" ? `(${describir(val)}, oculta)` : JSON.stringify(val));

async function api(metodo, cuerpo) {
  const r = await fetch(`${API}/v1/projects/${ref}/config/auth`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await r.text();
  if (!r.ok) throw new Error(`${metodo} config/auth → HTTP ${r.status}: ${ocultar(texto.slice(0, 300), SECRETOS)}`);
  return texto ? JSON.parse(texto) : {};
}

function combinarRedirects(actual) {
  const lista = String(actual ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const r of redirects) if (!lista.includes(r)) lista.push(r);
  return lista.join(",");
}

function imprimirPlan(actual) {
  console.log(`Proyecto: ${ref}   API: ${API}`);
  console.log("Cambios en Authentication:");
  for (const [k, val] of Object.entries(cambios)) {
    const antes = actual ? (k === "smtp_pass" ? "(oculta)" : JSON.stringify(actual[k] ?? null)) : null;
    console.log(`  ${k.padEnd(22)} ${actual ? `${antes} → ` : ""}${mostrar(k, val)}`);
  }
  if (actual) {
    console.log(`  ${"uri_allow_list".padEnd(22)} ${JSON.stringify(actual.uri_allow_list ?? "")} → ${JSON.stringify(combinarRedirects(actual.uri_allow_list))}`);
  } else {
    console.log(`  ${"uri_allow_list".padEnd(22)} (se agregan a la lista actual) ${redirects.join(", ")}`);
  }
  if (!redirects.some((r) => r.includes("localhost")))
    console.log(
      "Nota: al cambiar la Site URL, los magic links en local (localhost:8080) dejan de ser aceptados\n" +
        "      salvo que agregues http://localhost:8080/auth en REDIRECT_URLS_EXTRA.",
    );
}

try {
  if (!banderas.aplicar) {
    imprimirPlan(comparar ? await api("GET") : null);
    console.log("\nSIMULACIÓN: no se cambió nada. Para aplicar: node scripts/supabase-auth-prod.mjs --aplicar");
    process.exit(0);
  }
  const actual = await api("GET");
  imprimirPlan(actual);
  await api("PATCH", { ...cambios, uri_allow_list: combinarRedirects(actual.uri_allow_list) });
  const despues = await api("GET");
  const ok = despues.site_url === siteUrl && redirects.every((r) => String(despues.uri_allow_list ?? "").includes(r));
  console.log(ok ? "\nAPLICADO: Supabase Auth quedó configurado." : "\nAVISO: la API respondió pero la verificación no coincide; revisa el dashboard.");
  process.exit(ok ? 0 : 1);
} catch (e) {
  console.error(ocultar(e instanceof Error ? e.message : String(e), SECRETOS));
  process.exit(1);
}
