#!/usr/bin/env node
// T24 · Limpia las capturas de la app del banco (prueba real de un QR CoDi de Handle + Pey) antes de
// usarlas en el video: tapa con bloques opacos los datos personales.
//
//   node video/evidencias/limpiar.mjs [--media <carpeta>]
//
// Lee  MEDIA/evidencias/originales/<nombre>.png   (NUNCA se versionan ni entran al video)
// Escribe MEDIA/evidencias/<nombre>.png           (versión limpia que usa la escena e2b)
//
// Las zonas van en proporciones de la imagen (0–1), medidas sobre las capturas de 738×1600, para que
// funcionen igual con otra resolución de la misma pantalla. El color de cada bloque se toma de un
// pixel del fondo junto a la zona, así el parche se ve como parte de la tarjeta.
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { banderas, carpetaMedia } from "../lib.mjs";

/**
 * Por captura: zonas a tapar. `caja` = [x, y, ancho, alto] en proporción; `fondo` = punto [x, y] de
 * donde se toma el color; `texto` opcional (se escribe alineado a la derecha, p. ej. la CLABE corta);
 * `barra` dibuja una barra tenue (se nota que hay un dato oculto, sin mostrarlo); el texto y la barra
 * terminan en el margen derecho de la tarjeta (`MARGEN`), o empiezan en el izquierdo con `izquierda`.
 */
export const CAPTURAS = {
  "codi-qr-info": [
    // Contacto: nombre del titular (tarjeta azul).
    { dato: "titular", caja: [0.42, 0.262, 0.52, 0.04], fondo: [0.4, 0.282], barra: true },
    // CLABE completa → solo los últimos 4 dígitos, como en la otra pantalla del banco.
    { dato: "CLABE", caja: [0.42, 0.302, 0.52, 0.04], fondo: [0.4, 0.322], texto: "•••• 0385" },
    // Cuenta de origen: número de cuenta (•7746) y saldo disponible.
    { dato: "cuenta de origen", caja: [0.065, 0.762, 0.2, 0.034], fondo: [0.06, 0.745], barra: true, izquierda: true },
    { dato: "saldo", caja: [0.6, 0.722, 0.33, 0.035], fondo: [0.58, 0.74], barra: true },
  ],
  "codi-qr-valido": [
    // Contacto: nombre del titular (dos renglones).
    { dato: "titular", caja: [0.42, 0.578, 0.52, 0.06], fondo: [0.4, 0.6], barra: true },
  ],
};

/** Borde derecho de los valores en la pantalla del banco (proporción del ancho). */
const MARGEN = 0.918;

const aHex = ([r, g, b]) => "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
/** Luminancia aproximada para elegir barra/texto claros u oscuros. */
const esOscuro = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b < 128;

export async function limpiar(origen, destino, zonas) {
  const img = sharp(origen);
  const { width: W, height: H } = await img.metadata();
  const { data, info } = await sharp(origen).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixel = ([px, py]) => {
    const x = Math.round(px * W);
    const y = Math.round(py * H);
    const i = (y * info.width + x) * info.channels;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const capas = zonas.map((z) => {
    const [x, y, w, h] = [z.caja[0] * W, z.caja[1] * H, z.caja[2] * W, z.caja[3] * H].map(Math.round);
    const fondo = pixel(z.fondo);
    const oscuro = esOscuro(fondo);
    const tinta = oscuro ? "#ffffff" : "#1d1b18";
    let extra = "";
    if (z.barra) {
      const bh = Math.round(h * 0.42);
      const bw = Math.round(w * 0.62);
      const bx = z.izquierda ? Math.round(W * 0.083) - x : Math.round(W * MARGEN) - x - bw;
      extra = `<rect x="${bx}" y="${Math.round((h - bh) / 2)}" width="${bw}" height="${bh}" rx="${bh / 2}" fill="${tinta}" fill-opacity="0.18"/>`;
    }
    if (z.texto) {
      const tam = Math.round(h * 0.55);
      extra = `<text x="${Math.round(W * MARGEN) - x}" y="${Math.round(h / 2 + tam * 0.36)}" text-anchor="end" font-family="Helvetica Neue, Arial, sans-serif" font-weight="600" font-size="${tam}" fill="${tinta}">${z.texto}</text>`;
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" fill="${aHex(fondo)}"/>${extra}</svg>`;
    return { input: Buffer.from(svg), left: x, top: y };
  });
  await sharp(origen).composite(capas).png().toFile(destino);
  return capas.length;
}

async function main() {
  const b = banderas(process.argv.slice(2), ["media"]);
  const dir = join(carpetaMedia(b.media), "evidencias");
  mkdirSync(dir, { recursive: true });
  for (const [nombre, zonas] of Object.entries(CAPTURAS)) {
    const origen = join(dir, "originales", `${nombre}.png`);
    if (!existsSync(origen)) throw new Error(`Falta la captura original: ${origen}`);
    const destino = resolve(dir, `${nombre}.png`);
    const n = await limpiar(origen, destino, zonas);
    console.log(`  ${nombre}: ${n} zonas tapadas (${zonas.map((z) => z.dato).join(", ")}) → ${destino}`);
  }
  console.log("Revisa los PNG limpios a ojo antes de renderizar.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
