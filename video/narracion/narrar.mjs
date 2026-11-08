#!/usr/bin/env node
// T19 · Narración del video con la voz de Dylan (ElevenLabs).
//
//   node --env-file=.env video/narracion/narrar.mjs              # genera lo que falte o haya cambiado
//   node --env-file=.env video/narracion/narrar.mjs --simular    # solo dice qué haría (no gasta créditos)
//   node --env-file=.env video/narracion/narrar.mjs --verificar  # revisa los MP3 y reescribe duraciones.json
//   node --env-file=.env video/narracion/narrar.mjs --voz <id>   # otra voz (regenera todo con esa voz)
//   node --env-file=.env video/narracion/narrar.mjs --solo e2-cajero-cobra
//
// Lee los textos de video/narracion/textos.json y escribe en MEDIA (video/escenas.json → "media"):
//   narracion/<id>.mp3          el audio vigente de cada escena (lo usa T20)
//   narracion/duraciones.json   segundos de cada MP3, caracteres y hash del texto
//   narracion/historial/        cada versión generada (<id>.<hash>.mp3): volver a un texto o voz anterior no gasta
//   narracion/registro.json     generaciones por escena y caracteres gastados (límite de presupuesto)
//
// Presupuesto: los textos suman ≤ 6,000 caracteres y nunca más de 2 generaciones por escena en total
// (--max-generaciones <n> lo sube a mano, a propósito). Caché por hash de modelo + voz + ajustes + texto.
// Variables: ELEVENLABS_API_KEY y ELEVENLABS_VOICE_ID (nunca se imprimen).
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { infoMp3 } from "./mp3.mjs";

const AQUI = dirname(fileURLToPath(import.meta.url));
const PRESUPUESTO_CARACTERES = 6000;
const AYUDA = `Uso: node --env-file=.env video/narracion/narrar.mjs [opciones]
  --simular              no llama a ElevenLabs; muestra caracteres y qué se generaría
  --verificar            solo valida los MP3 existentes y reescribe duraciones.json
  --voz <id>             voice_id de ElevenLabs (por defecto ELEVENLABS_VOICE_ID)
  --solo <id>[,<id>]     solo esas escenas
  --max-generaciones <n> límite de generaciones por escena (por defecto 2)
  --media <ruta>         carpeta MEDIA (por defecto la de video/escenas.json)`;

function leerBanderas(argv) {
  const b = { simular: false, verificar: false, voz: null, solo: null, max: 2, media: null, ayuda: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--simular") b.simular = true;
    else if (a === "--verificar") b.verificar = true;
    else if (a === "--voz") b.voz = argv[++i];
    else if (a === "--solo") b.solo = argv[++i].split(",");
    else if (a === "--max-generaciones") b.max = Number(argv[++i]);
    else if (a === "--media") b.media = argv[++i];
    else if (a === "--ayuda" || a === "-h" || a === "--help") b.ayuda = true;
    else throw new Error(`Opción desconocida: ${a}\n${AYUDA}`);
  }
  if (!Number.isInteger(b.max) || b.max < 1) throw new Error("--max-generaciones debe ser un entero ≥ 1.");
  return b;
}

const leerJson = (ruta, porDefecto) => (existsSync(ruta) ? JSON.parse(readFileSync(ruta, "utf8")) : porDefecto);
const escribirJson = (ruta, datos) => writeFileSync(ruta, JSON.stringify(datos, null, 2) + "\n");

export function hashTexto({ modelo, voz, ajustes, texto }) {
  return createHash("sha256").update(JSON.stringify({ modelo, voz, ajustes, texto })).digest("hex").slice(0, 16);
}

async function generar({ texto, voz, modelo, ajustes, anterior, siguiente, clave }) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voz)}?output_format=mp3_44100_128`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "xi-api-key": clave, "content-type": "application/json", accept: "audio/mpeg" },
    body: JSON.stringify({
      text: texto,
      model_id: modelo,
      voice_settings: ajustes,
      // Contexto de las escenas vecinas: da continuidad a la entonación y no se cobra.
      ...(anterior ? { previous_text: anterior } : {}),
      ...(siguiente ? { next_text: siguiente } : {}),
    }),
  });
  if (!r.ok) {
    let detalle = await r.text();
    if (clave) detalle = detalle.split(clave).join("••••");
    throw new Error(`ElevenLabs respondió ${r.status}: ${detalle.slice(0, 300)}`);
  }
  // Para el presupuesto se cuenta el largo del texto (lo que cobra eleven_multilingual_v2); el
  // encabezado character-cost se guarda solo como referencia.
  const reportado = r.headers.get("character-cost");
  return { audio: Buffer.from(await r.arrayBuffer()), costo: texto.length, reportado: reportado ? Number(reportado) : null };
}

async function main() {
  const b = leerBanderas(process.argv.slice(2));
  if (b.ayuda) return console.log(AYUDA);

  const contrato = leerJson(resolve(AQUI, "..", "escenas.json"));
  const textos = leerJson(join(AQUI, "textos.json"));
  const media = resolve(b.media ?? contrato.media);
  const carpeta = join(media, "narracion");
  const historial = join(carpeta, "historial");
  mkdirSync(historial, { recursive: true });

  // Cada escena del contrato debe tener texto, y viceversa.
  const porId = new Map(textos.escenas.map((e) => [e.id, e]));
  for (const e of contrato.escenas) if (!porId.has(e.id)) throw new Error(`Falta el texto de la escena ${e.id}.`);
  for (const id of porId.keys())
    if (!contrato.escenas.some((e) => e.id === id)) throw new Error(`Escena desconocida en textos.json: ${id}`);
  const escenas = contrato.escenas.map((e) => ({ ...e, texto: porId.get(e.id).texto.trim() }));

  const total = escenas.reduce((s, e) => s + e.texto.length, 0);
  console.log(`Textos: ${escenas.length} escenas, ${total} caracteres (presupuesto ${PRESUPUESTO_CARACTERES}).`);
  if (total > PRESUPUESTO_CARACTERES) throw new Error("Los textos pasan del presupuesto de caracteres. Recórtalos.");

  const clave = process.env.ELEVENLABS_API_KEY;
  const voz = b.voz ?? process.env.ELEVENLABS_VOICE_ID;
  if (!voz && !b.verificar) throw new Error("Falta ELEVENLABS_VOICE_ID (o --voz <id>).");
  const modelo = textos.modelo;
  const ajustes = textos.voz;

  const rutaRegistro = join(carpeta, "registro.json");
  const registro = leerJson(rutaRegistro, { generaciones: {}, caracteresGastados: 0, eventos: [] });
  const rutaCache = join(carpeta, "cache.json");
  const cache = leerJson(rutaCache, {});

  if (!b.verificar) {
    for (const [i, e] of escenas.entries()) {
      if (b.solo && !b.solo.includes(e.id)) continue;
      const hash = hashTexto({ modelo, voz, ajustes, texto: e.texto });
      const destino = join(media, e.audio);
      const guardado = join(historial, `${e.id}.${hash}.mp3`);
      if (cache[e.id]?.hash === hash && existsSync(destino)) {
        console.log(`  ${e.id}: sin cambios (caché)`);
        continue;
      }
      if (existsSync(guardado)) {
        copyFileSync(guardado, destino);
        cache[e.id] = { hash, voz: voz === process.env.ELEVENLABS_VOICE_ID ? "predeterminada" : voz };
        console.log(`  ${e.id}: recuperado del historial (sin gastar)`);
        continue;
      }
      const hechas = registro.generaciones[e.id] ?? 0;
      if (hechas >= b.max) {
        console.log(`  ${e.id}: NO se genera: ya lleva ${hechas} generaciones (límite ${b.max}).`);
        continue;
      }
      if (b.simular) {
        console.log(`  ${e.id}: se generaría (${e.texto.length} caracteres, generación ${hechas + 1}/${b.max})`);
        continue;
      }
      if (!clave) throw new Error("Falta ELEVENLABS_API_KEY.");
      process.stdout.write(`  ${e.id}: generando (${e.texto.length} caracteres)… `);
      // Se cuenta antes de llamar: si la respuesta falla a medias, igual no se reintenta sin límite.
      registro.generaciones[e.id] = hechas + 1;
      escribirJson(rutaRegistro, registro);
      const { audio, costo, reportado } = await generar({
        texto: e.texto,
        voz,
        modelo,
        ajustes,
        anterior: escenas[i - 1]?.texto,
        siguiente: escenas[i + 1]?.texto,
        clave,
      });
      const info = infoMp3(audio);
      writeFileSync(guardado, audio);
      copyFileSync(guardado, destino);
      registro.caracteresGastados += costo;
      registro.eventos.push({
        id: e.id,
        hash,
        caracteres: costo,
        costoReportado: reportado,
        segundos: info.segundos,
        fecha: new Date().toISOString(),
      });
      escribirJson(rutaRegistro, registro);
      cache[e.id] = { hash, voz: voz === process.env.ELEVENLABS_VOICE_ID ? "predeterminada" : voz };
      escribirJson(rutaCache, cache);
      console.log(`${info.segundos.toFixed(1)} s`);
    }
    escribirJson(rutaCache, cache);
  }

  // Duraciones (también valida que cada archivo sea un MP3 legible).
  const duraciones = { _doc: "Generado por video/narracion/narrar.mjs. Segundos de cada MP3 de narración.", escenas: {} };
  let segundosTotal = 0;
  let faltan = 0;
  for (const e of escenas) {
    const ruta = join(media, e.audio);
    if (!existsSync(ruta)) {
      console.log(`  ${e.id}: FALTA ${ruta}`);
      faltan++;
      continue;
    }
    const info = infoMp3(readFileSync(ruta));
    duraciones.escenas[e.id] = {
      segundos: info.segundos,
      caracteres: e.texto.length,
      hash: cache[e.id]?.hash ?? null,
      archivo: e.audio,
      hz: info.hz,
      kbps: info.kbps,
    };
    segundosTotal += info.segundos;
  }
  duraciones.totalSegundos = Math.round(segundosTotal * 1000) / 1000;
  escribirJson(join(carpeta, "duraciones.json"), duraciones);
  for (const [id, d] of Object.entries(duraciones.escenas))
    console.log(`  ${id.padEnd(18)} ${d.segundos.toFixed(1).padStart(6)} s  ${String(d.caracteres).padStart(4)} car.  ${d.hz} Hz ${d.kbps} kbps`);
  console.log(
    `Total: ${duraciones.totalSegundos.toFixed(1)} s (${(segundosTotal / 60).toFixed(2)} min). ` +
      `Caracteres gastados en ElevenLabs (acumulado): ${registro.caracteresGastados}.`,
  );
  if (faltan && !b.simular) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
