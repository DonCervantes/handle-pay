// HND-025: convierte la dirección de un negocio en coordenadas con Nominatim (OpenStreetMap).
// Se llama UNA vez, al aprobar el expediente (no en cada carga del mapa), para respetar
// la política de uso de Nominatim: máximo 1 petición por segundo y un User-Agent que
// identifique a la app. https://operations.osmfoundation.org/policies/nominatim/

export type Ubicacion = {
  lat: number;
  lng: number;
  /** "direccion": se encontró la dirección; "codigo_postal": solo el centro del CP (aproximado). */
  precision: "direccion" | "codigo_postal";
};

const NOMINATIM = "https://nominatim.openstreetmap.org/search";

async function buscar(
  parametros: Record<string, string>,
): Promise<{ lat: number; lng: number } | null> {
  const query = new URLSearchParams({
    ...parametros,
    countrycodes: "mx",
    format: "jsonv2",
    limit: "1",
  });
  try {
    const r = await fetch(`${NOMINATIM}?${query}`, {
      headers: {
        "User-Agent": process.env["NOMINATIM_USER_AGENT"] ?? "handle-pey/0.1 (desarrollo local)",
        "Accept-Language": "es",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const resultados = (await r.json()) as { lat: string; lon: string }[];
    const primero = resultados[0];
    if (!primero) return null;
    const lat = Number(primero.lat);
    const lng = Number(primero.lon);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  } catch {
    return null; // sin red, tiempo agotado o respuesta inválida: el negocio queda "sin ubicar"
  }
}

/** Ubica un negocio. Devuelve null si no se pudo; nunca lanza error. */
export async function geocodificar(direccion: string, cp: string): Promise<Ubicacion | null> {
  const exacta = await buscar({ q: `${direccion}, ${cp}, México` });
  if (exacta) return { ...exacta, precision: "direccion" };

  // Política de Nominatim: no más de 1 petición por segundo.
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const aproximada = await buscar({ postalcode: cp });
  return aproximada ? { ...aproximada, precision: "codigo_postal" } : null;
}
