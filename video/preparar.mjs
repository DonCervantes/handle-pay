#!/usr/bin/env node
// T20 · Prepara el render: junta grabaciones (T18) y narración (T19) de MEDIA, mide cada archivo,
// los enlaza en video/public/media (ignorado por git) y escribe out/props.json para Remotion.
//
//   node preparar.mjs                         # usa MEDIA de escenas.json y narracion/textos.json
//   node preparar.mjs --textos <ruta>         # otro archivo de textos (formato de T19)
//   node preparar.mjs --media <carpeta>       # otra carpeta MEDIA
//   node preparar.mjs --prueba                # genera archivos sintéticos en out/prueba-media y los usa
//
// Lee opcionalmente MEDIA/grabaciones/marcas.json (T18) para saltar el inicio de un clip
// (`inicio` o `recorteInicio`, en segundos por escena).
import { copyFileSync, existsSync, linkSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { deflateSync } from "node:zlib";
import { banderas, carpetaMedia, contrato, DIR_OUT, DIR_PUBLICO, DIR_VIDEO, leerJson, remotionBin, RUTA_PROPS, sondear } from "./lib.mjs";
import { ajustarVideo, duracionEscena } from "./src/plan.ts";

const b = banderas(process.argv.slice(2), ["textos", "media"]);
const c = contrato();
const media = b.prueba ? generarPrueba() : carpetaMedia(b.media);
const rutaTextos = resolve(b.textos ?? join(DIR_VIDEO, "narracion", "textos.json"));

const textos = existsSync(rutaTextos) ? leerJson(rutaTextos) : null;
if (!textos && !b.prueba) {
  throw new Error(`No encontré los textos de la narración (${rutaTextos}). Pasa --textos <ruta> (salen de T19).`);
}
const textoDe = (id) => {
  const t = textos?.escenas?.find((e) => e.id === id);
  return (t?.subtitulos ?? t?.texto ?? "").trim();
};

const rutaMarcas = join(media, "grabaciones", "marcas.json");
const marcas = existsSync(rutaMarcas) ? leerJson(rutaMarcas) : {};
const marcaDe = (id) => marcas?.escenas?.[id] ?? marcas?.[id] ?? (Array.isArray(marcas?.escenas) ? marcas.escenas.find((m) => m.id === id) : null) ?? {};

// Enlaces (o copias) en public/media: Remotion sirve solo lo que está en su carpeta pública.
rmSync(join(DIR_PUBLICO, "media"), { recursive: true, force: true });
mkdirSync(join(DIR_PUBLICO, "media"), { recursive: true });
copyFileSync(join(DIR_VIDEO, "..", "public", "handle-logo.svg"), join(DIR_PUBLICO, "handle-logo.svg"));
function publicar(origen) {
  const destino = join(DIR_PUBLICO, "media", basename(origen));
  try {
    linkSync(origen, destino);
  } catch {
    copyFileSync(origen, destino);
  }
  return `media/${basename(origen)}`;
}

const faltan = [];
const escenas = c.escenas.map((e, numero) => {
  const texto = textoDe(e.id);
  let audio = null;
  const rutaAudio = join(media, e.audio);
  if (existsSync(rutaAudio)) {
    const s = sondear(rutaAudio);
    if (!s.audio) throw new Error(`${rutaAudio} no tiene pista de audio.`);
    audio = { src: publicar(rutaAudio), duracion: Math.round(s.duracion * 1000) / 1000 };
  } else faltan.push(rutaAudio);

  let video = null;
  if (e.grabacion) {
    const rutaVideo = join(media, e.grabacion);
    if (existsSync(rutaVideo)) {
      const s = sondear(rutaVideo);
      if (!s.video) throw new Error(`${rutaVideo} no tiene pista de video.`);
      const m = marcaDe(e.id);
      const vertical = s.video.alto > s.video.ancho;
      video = {
        src: publicar(rutaVideo),
        ancho: s.video.ancho,
        alto: s.video.alto,
        duracion: Math.round(s.duracion * 1000) / 1000,
        // T18 marca en `inicio` el primer cuadro útil (antes solo hay pantalla en blanco).
        recorteInicio: Number(m.recorteInicio ?? m.inicio ?? 0) || 0,
        // Si T18 ya centró el celular en un cuadro de 1920×1080 se muestra tal cual.
        dispositivo: vertical ? "celular" : "compu",
      };
    } else faltan.push(rutaVideo);
  }
  return { id: e.id, numero, titulo: e.titulo, texto, audio, video };
});

if (faltan.length && !b["permitir-faltantes"]) {
  console.error("Faltan archivos en MEDIA:\n  " + faltan.join("\n  "));
  console.error("(Usa --permitir-faltantes para armar el video sin ellos, o --prueba para archivos sintéticos.)");
  process.exit(1);
}

mkdirSync(DIR_OUT, { recursive: true });
writeFileSync(RUTA_PROPS, JSON.stringify({ escenas }, null, 2));

let total = 0;
console.log("escena              voz(s)  grab.(s)  escena(s)  vel.   cortado  congelado  disp.");
for (const e of escenas) {
  const d = duracionEscena(e);
  total += d;
  const a = e.video ? ajustarVideo(e.video, d) : null;
  console.log(
    [
      e.id.padEnd(18),
      (e.audio?.duracion.toFixed(1) ?? "—").padStart(6),
      (e.video?.duracion.toFixed(1) ?? "—").padStart(8),
      d.toFixed(1).padStart(9),
      (a ? `${a.velocidad}×` : "—").padStart(6),
      (a ? `${a.segundosCortados}s` : "—").padStart(8),
      (a ? `${a.segundosCongelados}s` : "—").padStart(10),
      (e.video?.dispositivo ?? "—").padStart(6),
    ].join("  "),
  );
}
console.log(`\nTotal: ${total.toFixed(1)} s (${Math.floor(total / 60)}:${String(Math.round(total % 60)).padStart(2, "0")})`);
console.log(`Props: ${RUTA_PROPS}${b.prueba ? "  (MODO PRUEBA: archivos sintéticos)" : ""}`);

/** Archivos sintéticos (barras de color + tono) para probar la composición sin T18/T19. */
function generarPrueba() {
  const dir = join(DIR_OUT, "prueba-media");
  mkdirSync(join(dir, "grabaciones"), { recursive: true });
  mkdirSync(join(dir, "narracion"), { recursive: true });
  // Duraciones elegidas para cubrir los tres casos: congelar, acelerar y recortar.
  const dur = { "e0-gancho": [8, 12], "e1-duena-puntos": [30, 20], "e2-cajero-cobra": [60, 22], "e3-monedero": [10, 14], "e4-mapa-perfil": [21, 16], "e5-red": [12, 15], "e6-cierre": [0, 8] };
  for (const e of contrato().escenas) {
    const [v, a] = dur[e.id] ?? [10, 10];
    const mp3 = join(dir, e.audio);
    if (!existsSync(mp3) || statSync(mp3).size === 0) {
      remotionBin("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", `sine=frequency=330:duration=${a}`, "-c:a", "libmp3lame", "-b:a", "128k", mp3]);
    }
    if (e.grabacion) {
      const webm = join(dir, e.grabacion);
      const [ancho, alto] = e.dispositivo === "celular" ? [390, 844] : [1920, 1080];
      if (!existsSync(webm) || statSync(webm).size === 0) {
        // El ffmpeg de Remotion no trae filtros de prueba (testsrc) ni rawvideo: se le pasan PNG.
        const porSeg = 2;
        const cuadros = [];
        for (let i = 0; i < v * porSeg; i++) {
          const buf = Buffer.alloc(ancho * alto * 3);
          const tono = (i / (v * porSeg)) * 200;
          for (let p = 0; p < ancho * alto; p++) {
            buf[p * 3] = 40 + tono;
            buf[p * 3 + 1] = 90;
            buf[p * 3 + 2] = 160 - tono / 2;
          }
          // Barra blanca que avanza con el tiempo (para ver velocidad y congelado).
          const x = Math.floor((i / (v * porSeg)) * (ancho - 40));
          for (let y = Math.floor(alto / 3); y < Math.floor((alto * 2) / 3); y++) for (let dx = 0; dx < 40; dx++) buf.fill(255, (y * ancho + x + dx) * 3, (y * ancho + x + dx) * 3 + 3);
          cuadros.push(png(buf, ancho, alto));
        }
        remotionBin(
          "ffmpeg",
          ["-y", "-hide_banner", "-loglevel", "error", "-f", "image2pipe", "-c:v", "png", "-framerate", String(porSeg), "-i", "-", "-r", "25", "-c:v", "libvpx", "-deadline", "realtime", "-cpu-used", "8", "-b:v", "1M", webm],
          { input: Buffer.concat(cuadros) },
        );
      }
    }
  }
  return dir;
}

/** PNG mínimo (RGB, sin filtro) con zlib de Node, para no depender de librerías de imágenes. */
function png(rgb, ancho, alto) {
  const filas = Buffer.alloc((ancho * 3 + 1) * alto);
  for (let y = 0; y < alto; y++) rgb.copy(filas, y * (ancho * 3 + 1) + 1, y * ancho * 3, (y + 1) * ancho * 3);
  const trozo = (tipo, datos) => {
    const largo = Buffer.alloc(4);
    largo.writeUInt32BE(datos.length);
    const td = Buffer.concat([Buffer.from(tipo), datos]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([largo, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0);
  ihdr.writeUInt32BE(alto, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), trozo("IHDR", ihdr), trozo("IDAT", deflateSync(filas, { level: 1 })), trozo("IEND", Buffer.alloc(0))]);
}

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
