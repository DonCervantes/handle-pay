#!/usr/bin/env node
// T20 · Verifica el MP4 renderizado: H.264, 1920×1080, con audio y con la duración esperada según
// out/props.json; extrae dos fotogramas por escena (tarjeta y mitad) a out/fotogramas/ para revisarlos.
//
//   node verificar.mjs [--video <ruta.mp4>] [--prueba]
import { mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { banderas, carpetaMedia, DIR_OUT, leerJson, remotionBin, RUTA_PROPS, sondear } from "./lib.mjs";
import { duracionEscena, TARJETA } from "./src/plan.ts";

const b = banderas(process.argv.slice(2), ["video", "media"]);
const ruta = resolve(b.video ?? (b.prueba ? join(DIR_OUT, "prueba.mp4") : join(carpetaMedia(b.media), "salida", "handle-demo.mp4")));
const { escenas } = leerJson(RUTA_PROPS);
const esperada = escenas.reduce((s, e) => s + Math.round(duracionEscena(e) * 30) / 30, 0);

const s = sondear(ruta);
const errores = [];
if (s.video?.codec !== "h264") errores.push(`códec de video ${s.video?.codec} (se esperaba h264)`);
if (s.video?.ancho !== 1920 || s.video?.alto !== 1080) errores.push(`resolución ${s.video?.ancho}×${s.video?.alto}`);
if (!s.audio) errores.push("sin pista de audio");
if (Math.abs(s.duracion - esperada) > 0.5) errores.push(`duración ${s.duracion.toFixed(2)} s (se esperaban ${esperada.toFixed(2)} s)`);

console.log(`${ruta}\n  ${s.video?.codec} ${s.video?.ancho}×${s.video?.alto} @ ${s.video?.fps}, audio ${s.audio?.codec ?? "—"} ${s.audio?.frecuencia ?? ""} Hz, ${s.duracion.toFixed(2)} s (esperado ${esperada.toFixed(2)} s)`);

const dir = join(DIR_OUT, "fotogramas");
rmSync(dir, { recursive: true, force: true });
mkdirSync(dir, { recursive: true });
let inicio = 0;
for (const e of escenas) {
  const d = Math.round(duracionEscena(e) * 30) / 30;
  const momentos = { tarjeta: inicio + TARJETA * 0.6, mitad: inicio + d * 0.55 };
  for (const [nombre, t] of Object.entries(momentos)) {
    const png = join(dir, `${e.id}-${nombre}.png`);
    remotionBin("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-ss", t.toFixed(2), "-i", ruta, "-frames:v", "1", "-vf", "scale=960:-2", png]);
  }
  inicio += d;
}
console.log(`  Fotogramas: ${dir}`);

if (errores.length) {
  console.error("FALLA:\n  " + errores.join("\n  "));
  process.exit(1);
}
console.log("OK");
