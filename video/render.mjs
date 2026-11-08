#!/usr/bin/env node
// T20 · Renderiza la composición HandleDemo con las props de preparar.mjs.
//
//   node render.mjs                     # → MEDIA/salida/handle-demo.mp4
//   node render.mjs --salida <ruta.mp4>
//   node render.mjs --prueba            # → out/prueba.mp4 (con props de `preparar.mjs --prueba`)
//   node render.mjs --frames 0-299      # solo un tramo (para revisar rápido)
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { banderas, carpetaMedia, DIR_OUT, DIR_VIDEO, RUTA_PROPS } from "./lib.mjs";

const b = banderas(process.argv.slice(2), ["salida", "media", "frames", "concurrencia"]);
if (!existsSync(RUTA_PROPS)) throw new Error("Primero corre: node preparar.mjs");

const salida = resolve(b.salida ?? (b.prueba ? join(DIR_OUT, "prueba.mp4") : join(carpetaMedia(b.media), "salida", "handle-demo.mp4")));
mkdirSync(dirname(salida), { recursive: true });

const args = [
  "remotion",
  "render",
  "src/index.ts",
  "HandleDemo",
  salida,
  `--props=${RUTA_PROPS}`,
  "--codec=h264",
  "--audio-codec=aac",
  "--crf=18",
  // La máquina puede estar cargada (otros agentes, Playwright): más margen para delayRender.
  "--timeout=120000",
  ...(b.frames ? [`--frames=${b.frames}`] : []),
  ...(b.concurrencia ? [`--concurrency=${b.concurrencia}`] : []),
];
console.log(`Renderizando → ${salida}`);
const r = spawnSync("npx", args, { cwd: DIR_VIDEO, stdio: "inherit" });
process.exit(r.status ?? 1);
