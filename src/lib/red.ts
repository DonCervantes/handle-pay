// Filtros de la cola de la red (/red). Puro: lo usan la pantalla y los tests.
import type { EstadoKyb } from "./kyb";

export type FiltroRed = EstadoKyb | "todos";

export type NegocioRed = { estado_kyb: EstadoKyb; activo: boolean };

/**
 * Negocios que se ven con un filtro. En "Aprobados" los inactivos (retirados del mapa) se
 * ocultan salvo que se pida verlos: la red trabaja con los que están en el mapa.
 */
export function negociosVisibles<T extends NegocioRed>(
  todos: readonly T[],
  filtro: FiltroRed,
  verInactivos: boolean,
): T[] {
  if (filtro === "todos") return [...todos];
  return todos.filter(
    (n) => n.estado_kyb === filtro && (filtro !== "aprobado" || verInactivos || n.activo),
  );
}

/** Aprobados pero inactivos: los que el interruptor muestra u oculta. */
export function aprobadosInactivos(todos: readonly NegocioRed[]): number {
  return todos.filter((n) => n.estado_kyb === "aprobado" && !n.activo).length;
}
