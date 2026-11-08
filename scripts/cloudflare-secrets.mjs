#!/usr/bin/env node
// HND-062 · Sube las variables de SERVIDOR del Worker a Cloudflare con `wrangler secret put`,
// leyéndolas de .env.production. El valor viaja por stdin (nunca en argumentos ni en pantalla).
//
//   node scripts/cloudflare-secrets.mjs                # SIMULACIÓN (por defecto): valida y lista nombres
//   node scripts/cloudflare-secrets.mjs --aplicar      # ejecuta wrangler secret put por cada variable
//   node scripts/cloudflare-secrets.mjs --env otra.env # otro archivo (por defecto .env.production)
//
// Requiere sesión de wrangler (`npx wrangler login`) o CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID.
// Las VITE_* no se suben: se inyectan al compilar (deben estar en el entorno de `bun run build`).
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { describir, leerArchivoEnv, leerBanderas } from "./lib/entorno.mjs";

// Lo que el código de servidor lee con process.env (ver src/). Obligatoria = el Worker no sirve sin ella.
const VARIABLES = [
  { nombre: "SUPABASE_URL", obligatoria: true },
  { nombre: "SUPABASE_PUBLISHABLE_KEY", obligatoria: true },
  { nombre: "SUPABASE_SERVICE_ROLE_KEY", obligatoria: true },
  { nombre: "PAYMENTS_PROVIDER", obligatoria: true },
  { nombre: "PEY_API_KEY", obligatoria: false },
  { nombre: "PEY_API_URL", obligatoria: false },
  { nombre: "PEY_WEBHOOK_SECRET", obligatoria: false },
  { nombre: "GROQ_API_KEY", obligatoria: false },
  { nombre: "GROQ_MODEL", obligatoria: false },
  { nombre: "N8N_WEBHOOK_URL", obligatoria: false },
  { nombre: "NOMINATIM_USER_AGENT", obligatoria: false },
];

const banderas = leerBanderas();
if (banderas.ayuda) {
  console.log("Uso: node scripts/cloudflare-secrets.mjs [--aplicar] [--env .env.production]");
  process.exit(0);
}

let archivo;
try {
  archivo = leerArchivoEnv(banderas.env);
} catch (e) {
  console.error(e.message);
  process.exit(2);
}

// Nombre del Worker: el de wrangler.jsonc (quitando comentarios de línea).
function nombreWorker() {
  if (process.env.WORKER_NAME) return process.env.WORKER_NAME;
  const texto = readFileSync("wrangler.jsonc", "utf8").replace(/^\s*\/\/.*$/gm, "");
  return JSON.parse(texto).name;
}

const val = (n) => (archivo[n] ?? "").trim();
const errores = [];
const avisos = [];
for (const { nombre, obligatoria } of VARIABLES)
  if (obligatoria && !val(nombre)) errores.push(`${nombre} falta o está vacía.`);

const proveedor = val("PAYMENTS_PROVIDER");
if (proveedor && !["mock", "pey"].includes(proveedor)) errores.push('PAYMENTS_PROVIDER debe ser "mock" o "pey".');
if (proveedor === "pey") {
  for (const n of ["PEY_API_KEY", "PEY_WEBHOOK_SECRET"])
    if (!val(n)) errores.push(`${n} es obligatoria con PAYMENTS_PROVIDER=pey.`);
  avisos.push("PAYMENTS_PROVIDER=pey: el Worker cobrará con dinero REAL.");
}
if (val("PEY_WEBHOOK_SECRET") && !val("PEY_WEBHOOK_SECRET").startsWith("whsec_"))
  errores.push("PEY_WEBHOOK_SECRET debe empezar con whsec_ (el que muestra el portal de Pey).");
if (val("SUPABASE_URL") && !val("SUPABASE_URL").startsWith("https://")) errores.push("SUPABASE_URL debe ser https://.");
if (val("SUPABASE_SERVICE_ROLE_KEY") && val("SUPABASE_SERVICE_ROLE_KEY") === val("SUPABASE_PUBLISHABLE_KEY"))
  errores.push("SUPABASE_SERVICE_ROLE_KEY no puede ser igual a la publishable.");
const ignoradas = Object.keys(archivo).filter((n) => n.startsWith("VITE_"));
if (ignoradas.length) avisos.push(`No se suben (van al build): ${ignoradas.join(", ")}`);

const aSubir = VARIABLES.filter(({ nombre }) => val(nombre));
let worker;
try {
  worker = nombreWorker();
} catch {
  errores.push("No se pudo leer el nombre del Worker de wrangler.jsonc (o define WORKER_NAME).");
}

console.log(`Worker: ${worker ?? "?"}   archivo: ${banderas.env}`);
for (const { nombre, obligatoria } of VARIABLES)
  console.log(`  ${nombre.padEnd(26)} ${describir(archivo[nombre]).padEnd(9)} ${obligatoria ? "obligatoria" : "opcional"}${val(nombre) ? "  → se sube" : ""}`);
for (const a of avisos) console.warn(`Aviso: ${a}`);

if (errores.length) {
  console.error("\nNo se puede continuar:\n" + errores.map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}
if (!banderas.aplicar) {
  console.log(`\nSIMULACIÓN: se subirían ${aSubir.length} variables. Para subirlas: node scripts/cloudflare-secrets.mjs --aplicar`);
  process.exit(0);
}

// WRANGLER_BIN permite probar con un wrangler falso; por defecto el del proyecto vía npx.
const [bin, ...base] = (process.env.WRANGLER_BIN ?? "npx --yes wrangler").split(" ");
function put(nombre, valor) {
  return new Promise((resolver) => {
    const hijo = spawn(bin, [...base, "secret", "put", nombre, "--name", worker], {
      stdio: ["pipe", "ignore", "pipe"],
    });
    let err = "";
    hijo.stderr.on("data", (d) => (err += d));
    hijo.on("error", (e) => resolver({ ok: false, err: e.message }));
    hijo.on("close", (code) => resolver({ ok: code === 0, err }));
    hijo.stdin.end(valor);
  });
}

let fallas = 0;
for (const { nombre } of aSubir) {
  const valor = val(nombre);
  const r = await put(nombre, valor);
  // El error de wrangler podría repetir el valor: se oculta antes de mostrarlo.
  const err = r.err.split(valor).join("••••").trim().split("\n").slice(-3).join(" | ");
  console.log(`  ${r.ok ? "OK   " : "FALLÓ"} ${nombre}${r.ok ? "" : `: ${err}`}`);
  if (!r.ok) fallas++;
}
console.log(fallas ? `\n${fallas} variable(s) no se subieron.` : `\nAPLICADO: ${aSubir.length} variables en el Worker ${worker}.`);
process.exit(fallas ? 1 : 0);
