// T20 · Lógica pura del video (sin Remotion): tiempos de cada escena, ajuste de la grabación a la
// narración y subtítulos. La usan la composición y las pruebas (`node --test`).

export const FPS = 30;
/** Segundos entre que empieza la escena (tarjeta de título) y arranca la voz. */
export const ENTRADA_VOZ = 0.6;
/** Silencio al final de cada escena, después de la voz. */
export const COLA = 0.9;
/** Duración de la tarjeta de título a pantalla completa. */
export const TARJETA = 1.8;
/** Nunca se acelera una grabación más que esto. */
export const VELOCIDAD_MAX = 1.25;

export type Video = {
  /** Ruta relativa a la carpeta pública (staticFile). */
  src: string;
  ancho: number;
  alto: number;
  /** Segundos del archivo. */
  duracion: number;
  /** Segundos que se saltan al inicio (carga de página, etc.). */
  recorteInicio: number;
  /** "celular" si la grabación es vertical (e3). */
  dispositivo: "compu" | "celular";
};

export type Escena = {
  id: string;
  numero: number;
  titulo: string;
  /** Texto narrado: fuente de los subtítulos. */
  texto: string;
  audio: { src: string; duracion: number } | null;
  video: Video | null;
};

export type PropsVideo = { escenas: Escena[] };

export const segundosAFrames = (s: number) => Math.round(s * FPS);

/** Duración total de la escena: la voz manda (nunca se corta) y la cierra una pausa corta. */
export function duracionEscena(e: Escena): number {
  const voz = e.audio?.duracion ?? 0;
  const minima = e.video ? 6 : 7;
  return Math.max(minima, ENTRADA_VOZ + voz + COLA);
}

export type Ajuste = {
  /** Velocidad de reproducción (1 = normal, máx. 1.25). */
  velocidad: number;
  /** Frames de la escena durante los que la grabación corre; después se congela el último cuadro. */
  framesReproduccion: number;
  /** Frames del archivo que se saltan al inicio. */
  framesRecorteInicio: number;
  /** Segundos de grabación que no caben (se cortan del final) — solo informativo. */
  segundosCortados: number;
  /** Segundos con el último cuadro congelado — solo informativo. */
  segundosCongelados: number;
};

/**
 * Ajusta la grabación al tiempo de la escena:
 * - si es más corta, se reproduce a velocidad normal y se congela el último cuadro;
 * - si es un poco más larga, se acelera suavemente (hasta 1.25×);
 * - si aun así no cabe, va a 1.25× y se recorta el final (la narración nunca se corta).
 */
export function ajustarVideo(v: Video, segundosEscena: number): Ajuste {
  // Un margen de 0.15 s evita pedir el cuadro exacto final del archivo (a veces no existe en webm).
  const util = Math.max(0.5, v.duracion - v.recorteInicio - 0.15);
  let velocidad = 1;
  let segundosCortados = 0;
  if (util > segundosEscena) {
    velocidad = Math.min(VELOCIDAD_MAX, util / segundosEscena);
    segundosCortados = Math.max(0, util - segundosEscena * velocidad);
  }
  const reproduccion = Math.min(segundosEscena, util / velocidad);
  return {
    velocidad: Math.round(velocidad * 1000) / 1000,
    framesReproduccion: Math.max(1, Math.floor(reproduccion * FPS)),
    framesRecorteInicio: segundosAFrames(v.recorteInicio),
    segundosCortados: Math.round(segundosCortados * 10) / 10,
    segundosCongelados: Math.round(Math.max(0, segundosEscena - reproduccion) * 10) / 10,
  };
}

export type Subtitulo = { texto: string; desde: number; hasta: number };

const LARGO_MAX = 95;

/** Divide en frases (. ? ! …) y parte las muy largas por comas o espacios cerca de la mitad. */
export function dividirFrases(texto: string): string[] {
  const frases = texto
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?…])\s+(?=[¿¡"“A-ZÁÉÍÓÚÑ0-9])/u)
    .map((f) => f.trim())
    .filter(Boolean);
  return frases.flatMap(partir);
}

function partir(frase: string): string[] {
  if (frase.length <= LARGO_MAX) return [frase];
  const mitad = frase.length / 2;
  // Primero comas, punto y coma o dos puntos; si no hay, el espacio más cercano a la mitad.
  const cortes: number[] = [];
  for (const m of frase.matchAll(/[,;:]\s/g)) cortes.push(m.index + 1);
  if (cortes.length === 0) for (const m of frase.matchAll(/\s/g)) cortes.push(m.index);
  const corte = cortes.sort((a, b) => Math.abs(a - mitad) - Math.abs(b - mitad))[0];
  if (corte === undefined || corte < 15 || corte > frase.length - 15) return [frase];
  return [...partir(frase.slice(0, corte).trim()), ...partir(frase.slice(corte).trim())];
}

/** Reparte las frases a lo largo del audio, proporcional a su número de letras (segundos desde que empieza la voz). */
export function subtitulos(texto: string, duracionAudio: number): Subtitulo[] {
  const frases = dividirFrases(texto);
  const peso = (f: string) => f.replace(/\s/g, "").length + 6; // +6: pausa natural entre frases
  const total = frases.reduce((s, f) => s + peso(f), 0);
  if (total === 0 || duracionAudio <= 0) return [];
  let t = 0;
  return frases.map((f) => {
    const dur = (peso(f) / total) * duracionAudio;
    const sub = { texto: f, desde: Math.round(t * 100) / 100, hasta: Math.round((t + dur) * 100) / 100 };
    t += dur;
    return sub;
  });
}
