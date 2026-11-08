#!/usr/bin/env node
// HND-005 · Verifica el artefacto de producción (.output) antes de desplegar a Cloudflare Workers.
//
//   bun run build && bun run verificar:bundle
//
// 1. Ningún secreto en el bundle: busca el VALOR de cada variable secreta que esté en el
//    entorno (`node --env-file=.env scripts/verificar-bundle.mjs` o `set -a; source .env; set +a`)
//    y patrones de llaves conocidas
//    (JWT con role=service_role, sb_secret_, gsk_, whsec_). Nunca imprime los valores.
// 2. El bundle del navegador no lee variables secretas (env.X / env["X"]): señal de código de
//    servidor filtrado. Mencionarlas en un texto de ayuda está bien.
// 3. MapLibre no está en el bundle del servidor (solo corre en el navegador).
// 4. El modo demo (T14) no existe en producción: el módulo que crea sesiones sin correo
//    (src/lib/demo.server.ts, marca "handle-demo-sesion-v1") no está en el bundle.
// 5. Tamaño del Worker (gzip) contra el límite de Cloudflare: 3 MiB en el plan gratuito,
//    10 MiB en el de pago. Falla si pasa LIMITE_WORKER_MIB (3 por defecto).
import { gzipSync } from "node:zlib";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SALIDA = process.argv[2] ?? ".output";
const SERVIDOR = join(SALIDA, "server");
const PUBLICO = join(SALIDA, "public");
const LIMITE_MIB = Number(process.env.LIMITE_WORKER_MIB ?? 3);

// Variables que jamás deben aparecer con su valor en el artefacto.
const SECRETOS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "PEY_API_KEY",
  "PEY_WEBHOOK_SECRET",
  "GROQ_API_KEY",
  "N8N_WEBHOOK_URL",
  "LOVABLE_CRON_SECRET",
  "LOVABLE_CRON_SECRET_PREVIOUS",
];
// Variables que el código del navegador no debe leer.
const NOMBRES_SOLO_SERVIDOR = SECRETOS.filter((n) => n !== "N8N_WEBHOOK_URL");

const TEXTO = /\.(m?js|cjs|json|html|css|map|txt|svg|xml|webmanifest)$/i;

function archivos(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    return statSync(ruta).isDirectory() ? archivos(ruta) : [ruta];
  });
}

function rolDeJwt(token) {
  try {
    const carga = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return typeof carga?.role === "string" ? carga.role : null;
  } catch {
    return null;
  }
}

const fallas = [];
const avisos = [];

if (!existsSync(SERVIDOR)) {
  console.error(`No existe ${SERVIDOR}. Corre primero: bun run build`);
  process.exit(2);
}

const todos = archivos(SALIDA).filter((f) => TEXTO.test(f));
const valores = SECRETOS.map((nombre) => [nombre, process.env[nombre]?.trim()]).filter(
  ([, v]) => v && v.length >= 8,
);
if (valores.length === 0) {
  avisos.push(
    "No hay secretos en el entorno: solo se revisaron patrones. Para revisar valores: set -a; source .env; set +a",
  );
}

const PATRONES = [
  ["llave secreta de Supabase (sb_secret_)", /sb_secret_[A-Za-z0-9_-]{10,}/],
  ["llave de Groq (gsk_)", /gsk_[A-Za-z0-9]{20,}/],
  ["secreto de webhook (whsec_)", /whsec_[A-Za-z0-9+/=]{16,}/],
];
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;

for (const archivo of todos) {
  const texto = readFileSync(archivo, "utf8");
  const ruta = relative(SALIDA, archivo);
  for (const [nombre, valor] of valores) {
    if (texto.includes(valor)) fallas.push(`El valor de ${nombre} aparece en ${ruta}`);
  }
  for (const [descripcion, patron] of PATRONES) {
    if (patron.test(texto)) fallas.push(`Posible ${descripcion} en ${ruta}`);
  }
  for (const [token] of texto.matchAll(JWT)) {
    if (rolDeJwt(token) === "service_role") fallas.push(`JWT con role=service_role en ${ruta}`);
  }
}

for (const archivo of archivos(PUBLICO).filter((f) => /\.m?js$/.test(f))) {
  const texto = readFileSync(archivo, "utf8");
  for (const nombre of NOMBRES_SOLO_SERVIDOR) {
    if (new RegExp(`env(\\.|\\[["'\`])${nombre}\\b`).test(texto)) {
      fallas.push(`El bundle del navegador lee ${nombre} (${relative(SALIDA, archivo)})`);
    }
  }
}

const modulos = archivos(SERVIDOR).filter((f) => /\.(m?js|cjs|wasm)$/.test(f));
const maplibre = modulos.filter((f) => /maplibre/i.test(relative(SERVIDOR, f)));
if (maplibre.length) {
  fallas.push(`MapLibre está en el bundle del servidor: ${maplibre.map((f) => relative(SALIDA, f)).join(", ")}`);
}

// T14: la marca solo vive en demo.server.ts, que se importa en ramas `if (import.meta.env.DEV)`.
const MARCA_DEMO = "handle-demo-sesion-v1";
for (const archivo of todos) {
  if (readFileSync(archivo, "utf8").includes(MARCA_DEMO)) {
    fallas.push(`El modo demo (sesión sin correo) está en el build: ${relative(SALIDA, archivo)}`);
  }
}

const contenido = modulos.map((f) => readFileSync(f));
const crudo = contenido.reduce((s, b) => s + b.length, 0);
const comprimido = gzipSync(Buffer.concat(contenido), { level: 9 }).length;
const mib = (n) => (n / 1024 / 1024).toFixed(2);
console.log(`Worker: ${modulos.length} módulos, ${mib(crudo)} MiB sin comprimir, ${mib(comprimido)} MiB gzip`);
console.log(`Límite usado: ${LIMITE_MIB} MiB gzip (gratuito 3, de pago 10)`);
if (comprimido > LIMITE_MIB * 1024 * 1024) {
  fallas.push(`El Worker pesa ${mib(comprimido)} MiB gzip y el límite es ${LIMITE_MIB} MiB`);
}
console.log(`Revisados ${todos.length} archivos; ${valores.length} secretos del entorno comparados.`);

for (const aviso of avisos) console.warn(`AVISO: ${aviso}`);
if (fallas.length) {
  for (const falla of fallas) console.error(`FALLA: ${falla}`);
  process.exit(1);
}
console.log("OK: sin secretos en el bundle, sin modo demo, MapLibre fuera del servidor y dentro del límite.");
