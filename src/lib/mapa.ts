// Fase 5 · Mapa público (HND-050 a 053): lógica pura, sin dependencias del navegador.
// La usan /mapa, /mapa/$id y los tests. Los datos vienen de la función SQL
// negocios_publicos(), que ya excluye todo lo sensible; aquí además se arma una
// lista blanca para que un cambio en la base no filtre columnas nuevas a la UI.
import { z } from "zod";
import { CATEGORIAS, type Categoria } from "./kyb";

export type NegocioPublico = {
  id: string;
  nombre: string;
  categoria: Categoria;
  direccion: string | null;
  /** null si el negocio aún no se pudo ubicar. */
  ubicacion: { lat: number; lng: number } | null;
  horario: { dias: string; horas: string }[];
  recomendado: boolean;
  /** Puntos que se ganan por cada $100 pagados (regla activa), o null si no hay programa. */
  puntosPorcentaje: number | null;
};

const VALORES_CATEGORIA = CATEGORIAS.map((c) => c.valor) as [Categoria, ...Categoria[]];

/** Search params de /mapa. Valores inválidos en la URL se ignoran en lugar de romper la página. */
export const busquedaMapa = z.object({
  categoria: z.enum(VALORES_CATEGORIA).optional().catch(undefined),
  recomendados: z.boolean().optional().catch(undefined),
});
export type BusquedaMapa = z.infer<typeof busquedaMapa>;

export function etiquetaCategoria(valor: string): string {
  return CATEGORIAS.find((c) => c.valor === valor)?.etiqueta ?? valor;
}

function numeroONulo(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function textoONulo(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Convierte el horario guardado (jsonb libre) en filas para mostrar.
 * Acepta un texto ("Lun a sáb 8:00-21:00"), un objeto { "lun-sab": "8:00-21:00" } o el
 * arreglo [{ dias, horas }] que guarda /negocio (src/lib/horario.ts; arreglo para conservar
 * el orden de los días). Cualquier otra forma se ignora.
 */
export function horarioLegible(horario: unknown): { dias: string; horas: string }[] {
  if (typeof horario === "string") {
    const t = horario.trim();
    return t ? [{ dias: "", horas: t }] : [];
  }
  if (Array.isArray(horario)) {
    return horario.flatMap((t: unknown) => {
      if (!t || typeof t !== "object") return [];
      const { dias, horas } = t as Record<string, unknown>;
      return typeof dias === "string" && typeof horas === "string" && horas.trim()
        ? [{ dias: dias.trim(), horas: horas.trim() }]
        : [];
    });
  }
  if (!horario || typeof horario !== "object") return [];
  return Object.entries(horario as Record<string, unknown>)
    .filter((e): e is [string, string] => typeof e[1] === "string" && e[1].trim() !== "")
    .map(([dias, horas]) => ({ dias: dias.trim(), horas: horas.trim() }));
}

/** Lo que devuelve negocios_publicos(); se trata como desconocido y se valida al mapear. */
export type FilaNegocioPublico = Partial<
  Record<
    | "id"
    | "nombre_comercial"
    | "categoria"
    | "direccion"
    | "lat"
    | "lng"
    | "horario"
    | "recomendado"
    | "puntos_porcentaje",
    unknown
  >
>;

/**
 * Fila de negocios_publicos() → modelo de la UI. Solo copia campos conocidos
 * (lista blanca) y descarta filas sin id, nombre o con categoría desconocida.
 */
export function aNegocioPublico(fila: FilaNegocioPublico): NegocioPublico | null {
  const id = textoONulo(fila.id);
  const nombre = textoONulo(fila.nombre_comercial);
  const categoria = fila.categoria;
  if (!id || !nombre || !VALORES_CATEGORIA.includes(categoria as Categoria)) return null;

  const lat = numeroONulo(fila.lat);
  const lng = numeroONulo(fila.lng);
  const ubicacionValida =
    lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  const puntos = numeroONulo(fila.puntos_porcentaje);

  return {
    id,
    nombre,
    categoria: categoria as Categoria,
    direccion: textoONulo(fila.direccion),
    ubicacion: ubicacionValida ? { lat, lng } : null,
    horario: horarioLegible(fila.horario),
    recomendado: fila.recomendado === true,
    puntosPorcentaje: puntos !== null && puntos > 0 ? puntos : null,
  };
}

export function aNegociosPublicos(filas: readonly FilaNegocioPublico[] | null | undefined) {
  return (filas ?? []).map(aNegocioPublico).filter((n): n is NegocioPublico => n !== null);
}

/** Aplica los filtros de la URL. Los recomendados van primero y luego por nombre. */
export function filtrarNegocios(negocios: readonly NegocioPublico[], filtros: BusquedaMapa) {
  return negocios
    .filter(
      (n) =>
        (!filtros.categoria || n.categoria === filtros.categoria) &&
        (!filtros.recomendados || n.recomendado),
    )
    .sort(
      (a, b) =>
        Number(b.recomendado) - Number(a.recomendado) || a.nombre.localeCompare(b.nombre, "es-MX"),
    );
}

/** Solo los que tienen pin. */
export function conUbicacion(negocios: readonly NegocioPublico[]) {
  return negocios.filter(
    (n): n is NegocioPublico & { ubicacion: { lat: number; lng: number } } => n.ubicacion !== null,
  );
}

/** Cuántos negocios hay por categoría (para los chips del filtro). */
export function conteoPorCategoria(negocios: readonly NegocioPublico[]) {
  const conteo: Partial<Record<Categoria, number>> = {};
  for (const n of negocios) conteo[n.categoria] = (conteo[n.categoria] ?? 0) + 1;
  return conteo;
}

/** Centro de la Ciudad de México: vista inicial cuando no hay pines. */
export const CENTRO_POR_DEFECTO = { lat: 19.432608, lng: -99.133209 } as const;

/**
 * Caja que contiene todos los pines ([[oeste, sur], [este, norte]]), o null si no hay.
 * Con un solo pin la caja es un punto; el mapa lo resuelve con maxZoom.
 */
export function limites(
  puntos: readonly { lat: number; lng: number }[],
): [[number, number], [number, number]] | null {
  if (puntos.length === 0) return null;
  let oeste = Infinity;
  let sur = Infinity;
  let este = -Infinity;
  let norte = -Infinity;
  for (const p of puntos) {
    oeste = Math.min(oeste, p.lng);
    este = Math.max(este, p.lng);
    sur = Math.min(sur, p.lat);
    norte = Math.max(norte, p.lat);
  }
  return [
    [oeste, sur],
    [este, norte],
  ];
}

/** Enlace para pedir indicaciones (abre la app de mapas del celular). */
export function enlaceComoLlegar(u: { lat: number; lng: number }): string {
  return `https://www.openstreetmap.org/directions?to=${u.lat}%2C${u.lng}#map=17/${u.lat}/${u.lng}`;
}
