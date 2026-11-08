#!/usr/bin/env node
// T16 · Demo en celular: levanta Handle para presentarlo desde otro dispositivo.
//
//   bun run demo              # red local: abre la URL o escanea el QR desde un celular en la misma WiFi
//   bun run demo -- --tunel   # internet: túnel temporal de Cloudflare (sin cuenta, URL al azar)
//   bun run demo -- --puerto 8090
//
// Siempre con el simulador de pagos (PAYMENTS_PROVIDER=mock, nunca dinero real) y con el modo
// demo encendido (DEMO_MODE=true: la página /demo entra sin correo a las cuentas
// @demo.handle-prueba.mx). Usa `vite dev`: el modo demo NO existe en el build de producción.
// Los datos de demo se crean antes con `bun run demo:datos`.
// Lee el .env de la carpeta actual sin imprimir ningún valor.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import QRCode from "qrcode";

const AYUDA = `Uso: bun run demo [-- --tunel] [-- --puerto <n>]
  --tunel        además abre un túnel https temporal con cloudflared (sin cuenta)
  --puerto <n>   puerto local (por defecto 8080)
  --env <ruta>   archivo de variables (por defecto .env)`;

export function leerBanderas(argv) {
  const b = { tunel: false, puerto: 8080, env: ".env", ayuda: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--tunel" || a === "--túnel") b.tunel = true;
    else if (a === "--puerto") b.puerto = Number(argv[++i]);
    else if (a.startsWith("--puerto=")) b.puerto = Number(a.slice(9));
    else if (a === "--env") b.env = argv[++i];
    else if (a.startsWith("--env=")) b.env = a.slice(6);
    else if (a === "--ayuda" || a === "-h" || a === "--help") b.ayuda = true;
    else throw new Error(`Opción desconocida: ${a}\n${AYUDA}`);
  }
  if (!Number.isInteger(b.puerto) || b.puerto < 1 || b.puerto > 65535) throw new Error("Puerto inválido.");
  return b;
}

/** IPv4 de la red local (WiFi/ethernet), prefiriendo rangos privados típicos de casa u oficina. */
export function ipLocal(interfaces = networkInterfaces()) {
  const candidatas = Object.entries(interfaces)
    .flatMap(([nombre, lista]) => (lista ?? []).map((i) => ({ nombre, ...i })))
    .filter((i) => (i.family === "IPv4" || i.family === 4) && !i.internal)
    .filter((i) => !/^(utun|awdl|llw|bridge|docker|veth|vmnet|vboxnet|tailscale)/i.test(i.nombre));
  const prioridad = (ip) => (ip.startsWith("192.168.") ? 0 : ip.startsWith("10.") ? 1 : /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ? 2 : 3);
  candidatas.sort((a, b) => prioridad(a.address) - prioridad(b.address));
  return candidatas[0]?.address ?? null;
}

/** Procesos hijos (app y túnel): se cierran al salir, también si algo falla. */
const hijos = [];
const cerrarHijos = () => {
  for (const h of hijos) h.kill();
};

async function mostrarQr(titulo, url) {
  console.log(`\n${titulo}\n  ${url}\n`);
  console.log(await QRCode.toString(url, { type: "terminal", small: true }));
}

async function esperarSalud(base, segundos = 90) {
  const limite = Date.now() + segundos * 1000;
  while (Date.now() < limite) {
    try {
      const r = await fetch(`${base}/api/health`);
      if (r.ok) return await r.json();
    } catch {
      // Todavía arrancando.
    }
    await new Promise((res) => setTimeout(res, 1000));
  }
  throw new Error(`La app no respondió en ${segundos} s.`);
}

function abrirTunel(puerto) {
  const hay = spawnSync("cloudflared", ["--version"], { stdio: "ignore" });
  if (hay.error || hay.status !== 0) {
    console.error(
      "\nNo encontré cloudflared. Instálalo y vuelve a correr con --tunel:\n" +
        "  macOS:   brew install cloudflared\n" +
        "  Windows: winget install --id Cloudflare.cloudflared\n" +
        "  Linux:   https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/\n" +
        "Mientras tanto la demo sigue disponible en la red local.",
    );
    return null;
  }
  const proc = spawn("cloudflared", ["tunnel", "--no-autoupdate", "--url", `http://localhost:${puerto}`], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  hijos.push(proc);
  const url = new Promise((resolve) => {
    const buscar = (trozo) => {
      const m = String(trozo).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m) resolve(m[0]);
    };
    proc.stdout.on("data", buscar);
    proc.stderr.on("data", buscar);
    proc.on("exit", () => resolve(null));
  });
  return { proc, url };
}

async function main() {
  const b = leerBanderas(process.argv.slice(2));
  if (b.ayuda) {
    console.log(AYUDA);
    return;
  }

  const rutaEnv = resolve(process.cwd(), b.env);
  if (!existsSync(rutaEnv)) throw new Error(`No existe ${b.env}. Pide los valores del .env al dueño del proyecto.`);
  const delArchivo = parseEnv(readFileSync(rutaEnv, "utf8"));
  if ((delArchivo.PAYMENTS_PROVIDER ?? "mock").trim().toLowerCase() !== "mock") {
    console.log("Aviso: el .env dice PAYMENTS_PROVIDER distinto de mock; la demo lo fuerza a mock (sin dinero real).");
  }

  const env = {
    ...process.env,
    ...delArchivo,
    PAYMENTS_PROVIDER: "mock",
    DEMO_MODE: "true",
    // Sin automatizaciones externas durante la demo.
    N8N_WEBHOOK_URL: "",
    // Vite solo atiende hosts conocidos; el túnel usa *.trycloudflare.com.
    ...(b.tunel ? { __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS: ".trycloudflare.com" } : {}),
  };

  const vite = join(process.cwd(), "node_modules", "vite", "bin", "vite.js");
  if (!existsSync(vite)) throw new Error("Falta instalar dependencias: npx bun install");

  console.log(`Levantando Handle en modo demo (pagos simulados) en el puerto ${b.puerto}…`);
  const app = spawn(process.execPath, [vite, "dev", "--host", "0.0.0.0", "--port", String(b.puerto), "--strictPort"], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  hijos.push(app);
  // Solo se reenvían errores del servidor (el resto ensucia la pantalla del QR).
  // Con DEMO_DETALLE=1 se ve todo el log de Vite.
  const reenviar = (destino) => (d) => {
    const t = String(d);
    if (process.env.DEMO_DETALLE === "1" || /\berror\b|EADDRINUSE|failed/i.test(t)) destino.write(t);
  };
  app.stderr.on("data", reenviar(process.stderr));
  app.stdout.on("data", reenviar(process.stdout));

  let tunel = null;
  for (const senal of ["SIGINT", "SIGTERM"]) {
    process.on(senal, () => {
      cerrarHijos();
      process.exit(0);
    });
  }
  app.on("exit", (codigo) => {
    cerrarHijos();
    if (codigo) console.error(`La app se detuvo (código ${codigo}). ¿El puerto ${b.puerto} está ocupado?`);
    process.exit(codigo ?? 0);
  });

  const local = `http://localhost:${b.puerto}`;
  const salud = await esperarSalud(local);
  if (!salud.demo) {
    throw new Error("La app arrancó pero el modo demo quedó apagado. Revisa que no estés usando un build de producción.");
  }

  console.log(`\nListo. En esta computadora: ${local}/demo`);
  const ip = ipLocal();
  if (ip) {
    await mostrarQr("Desde un celular en la misma red WiFi, escanea o abre:", `http://${ip}:${b.puerto}/demo`);
  } else {
    console.log("No encontré una IP de red local (¿sin WiFi?). Usa --tunel para abrirla desde el celular.");
  }

  if (b.tunel) {
    tunel = abrirTunel(b.puerto);
    if (tunel) {
      console.log("Abriendo túnel con cloudflared…");
      const url = await Promise.race([tunel.url, new Promise((r) => setTimeout(() => r(null), 30_000))]);
      if (url) {
        await mostrarQr("Desde cualquier celular (internet), escanea o abre:", `${url}/demo`);
        console.log(
          "Ojo: cualquiera con este enlace entra a las cuentas de demo mientras corra el túnel. Ciérralo con Ctrl+C al terminar.",
        );
      } else {
        console.error("El túnel no entregó una URL en 30 s. La demo sigue en la red local.");
      }
    }
  }

  console.log(
    "\nSi el celular no abre la página: misma red WiFi, sin \"aislamiento de clientes\" en el router, y permite\n" +
      "conexiones entrantes a node en el firewall. Ctrl+C para terminar.",
  );
}

// Solo arranca al correrlo como script (las pruebas importan ipLocal y leerBanderas).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    cerrarHijos();
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
