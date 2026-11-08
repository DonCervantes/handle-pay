// Lectura mínima de MP3 (MPEG audio) sin ffprobe: valida el archivo y calcula su duración
// contando cuadros. Sirve para los MP3 que entrega ElevenLabs (MPEG-1 Layer III, 44.1 kHz).

const BITRATES = {
  // [versión][capa] → kbps por índice
  1: {
    1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
    2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
    3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  },
  2: {
    1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
    2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
    3: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  },
};
const MUESTREO = { 1: [44100, 48000, 32000], 2: [22050, 24000, 16000], 2.5: [11025, 12000, 8000] };

function leerCuadro(buf, i) {
  if (i + 4 > buf.length || buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) return null;
  const v = (buf[i + 1] >> 3) & 3; // 0: 2.5, 2: 2, 3: 1
  const c = (buf[i + 1] >> 1) & 3; // 1: III, 2: II, 3: I
  if (v === 1 || c === 0) return null;
  const version = v === 3 ? 1 : v === 2 ? 2 : 2.5;
  const capa = 4 - c;
  const bi = (buf[i + 2] >> 4) & 0xf;
  const si = (buf[i + 2] >> 2) & 3;
  if (bi === 0 || bi === 15 || si === 3) return null;
  const kbps = BITRATES[version === 1 ? 1 : 2][capa][bi];
  const hz = MUESTREO[version][si];
  const relleno = (buf[i + 2] >> 1) & 1;
  const muestras = capa === 1 ? 384 : capa === 3 && version !== 1 ? 576 : 1152;
  const largo =
    capa === 1 ? (Math.floor((12 * kbps * 1000) / hz) + relleno) * 4 : Math.floor(((muestras / 8) * kbps * 1000) / hz) + relleno;
  return { largo, hz, muestras, kbps };
}

/** Devuelve { segundos, cuadros, hz, kbps } o lanza si el archivo no parece un MP3 válido. */
export function infoMp3(buf) {
  let i = 0;
  // Etiqueta ID3v2 al inicio.
  if (buf.length >= 10 && buf.toString("latin1", 0, 3) === "ID3") {
    const tam = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    i = 10 + tam;
  }
  // Buscar el primer cuadro (tolerando basura breve).
  let primero = null;
  for (let tope = Math.min(buf.length, i + 4096); i < tope; i++) {
    const c = leerCuadro(buf, i);
    if (c && leerCuadro(buf, i + c.largo)) {
      primero = c;
      break;
    }
  }
  if (!primero) throw new Error("No encontré cuadros MPEG: no es un MP3 válido.");
  let cuadros = 0;
  let muestras = 0;
  let kbpsSuma = 0;
  while (i < buf.length) {
    const c = leerCuadro(buf, i);
    if (!c) break;
    // El cuadro "Xing"/"Info" (cabecera VBR) no lleva audio.
    const cuerpo = buf.toString("latin1", i + 4, Math.min(i + 40, buf.length));
    if (!(cuadros === 0 && (cuerpo.includes("Xing") || cuerpo.includes("Info")))) {
      cuadros++;
      muestras += c.muestras;
      kbpsSuma += c.kbps;
    }
    i += c.largo;
  }
  if (cuadros < 10) throw new Error(`MP3 demasiado corto (${cuadros} cuadros).`);
  return {
    segundos: Math.round((muestras / primero.hz) * 1000) / 1000,
    cuadros,
    hz: primero.hz,
    kbps: Math.round(kbpsSuma / cuadros),
  };
}
