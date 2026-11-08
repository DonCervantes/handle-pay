// T20 · Utilidades compartidas por preparar.mjs, render.mjs y verificar.mjs.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const DIR_VIDEO = dirname(fileURLToPath(import.meta.url));
export const DIR_PUBLICO = join(DIR_VIDEO, "public");
export const DIR_OUT = join(DIR_VIDEO, "out");
export const RUTA_PROPS = join(DIR_OUT, "props.json");

export function leerJson(ruta) {
  return JSON.parse(readFileSync(ruta, "utf8"));
}

export const contrato = () => leerJson(join(DIR_VIDEO, "escenas.json"));

/** Carpeta MEDIA (archivos pesados, fuera de git): --media, HANDLE_MEDIA o la de escenas.json. */
export function carpetaMedia(argMedia) {
  return resolve(argMedia ?? process.env.HANDLE_MEDIA ?? contrato().media);
}

/** Lee banderas `--clave valor` y `--bandera`. */
export function banderas(argv, conValor = []) {
  const b = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) throw new Error(`Argumento inesperado: ${a}`);
    const [clave, valorEnLinea] = a.slice(2).split("=", 2);
    if (conValor.includes(clave)) b[clave] = valorEnLinea ?? argv[++i];
    else b[clave] = true;
  }
  return b;
}

/** Ejecuta el ffmpeg/ffprobe que trae Remotion (no hace falta instalar ffmpeg). */
export function remotionBin(herramienta, args, opciones = {}) {
  const r = spawnSync("npx", ["remotion", herramienta, ...args], {
    cwd: DIR_VIDEO,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...opciones,
  });
  if (r.status !== 0) throw new Error(`${herramienta} falló (${r.status}): ${(r.stderr || "").slice(-800)}`);
  return r.stdout;
}

/** Duración (s), tamaño y streams de un archivo multimedia. */
export function sondear(ruta) {
  if (!existsSync(ruta)) throw new Error(`No existe ${ruta}`);
  const salida = remotionBin("ffprobe", ["-v", "error", "-show_format", "-show_streams", "-of", "json", ruta]);
  const j = JSON.parse(salida);
  const video = j.streams.find((s) => s.codec_type === "video");
  const audio = j.streams.find((s) => s.codec_type === "audio");
  let duracion = Number(j.format?.duration);
  if (!Number.isFinite(duracion) || duracion <= 0) duracion = Number(video?.duration ?? audio?.duration);
  // Los webm de Playwright a veces no traen duración en el contenedor: se cuenta decodificando.
  if (!Number.isFinite(duracion) || duracion <= 0) duracion = duracionDecodificando(ruta);
  return {
    duracion,
    formato: j.format?.format_name,
    video: video ? { codec: video.codec_name, ancho: video.width, alto: video.height, fps: video.avg_frame_rate } : null,
    audio: audio ? { codec: audio.codec_name, canales: audio.channels, frecuencia: Number(audio.sample_rate) } : null,
  };
}

function duracionDecodificando(ruta) {
  const r = spawnSync("npx", ["remotion", "ffmpeg", "-hide_banner", "-i", ruta, "-f", "null", "-"], {
    cwd: DIR_VIDEO,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const tiempos = [...String(r.stderr).matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
  const u = tiempos.at(-1);
  if (!u) throw new Error(`No pude medir la duración de ${ruta}`);
  return Number(u[1]) * 3600 + Number(u[2]) * 60 + Number(u[3]);
}
