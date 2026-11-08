// HND-115: reglas puras para mover a mano el pin de un negocio (sin dependencias del navegador).

export type Coordenada = { lat: number; lng: number };

/**
 * Caja amplia que contiene a México (incluye islas y costas). Sirve para atrapar
 * errores como lat/lng invertidos o un clic fuera del país; no es una frontera exacta.
 */
export const LIMITES_MEXICO = { latMin: 14, latMax: 33.5, lngMin: -118.5, lngMax: -86 } as const;

/** La base guarda numeric(9, 6): seis decimales (~10 cm). */
export function redondearCoordenada(c: Coordenada): Coordenada {
  return { lat: Number(c.lat.toFixed(6)), lng: Number(c.lng.toFixed(6)) };
}

/** Mensaje de error para mostrar, o null si la coordenada se puede guardar. */
export function errorCoordenada(c: Coordenada): string | null {
  if (!Number.isFinite(c.lat) || !Number.isFinite(c.lng)) return "Coordenadas inválidas.";
  const { latMin, latMax, lngMin, lngMax } = LIMITES_MEXICO;
  if (c.lat < latMin || c.lat > latMax || c.lng < lngMin || c.lng > lngMax) {
    return "El pin debe quedar dentro de México.";
  }
  return null;
}

/** ¿El pin cambió de lugar respecto a lo guardado? (compara ya redondeado). */
export function pinCambio(guardado: Coordenada | null, nuevo: Coordenada): boolean {
  if (!guardado) return true;
  const a = redondearCoordenada(guardado);
  const b = redondearCoordenada(nuevo);
  return a.lat !== b.lat || a.lng !== b.lng;
}
