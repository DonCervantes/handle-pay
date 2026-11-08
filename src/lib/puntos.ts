/**
 * Programa de puntos de Handle (Fase 4). Funciones puras, seguras para el navegador.
 * La fuente de verdad es la base (registrar_pago_pey, aplicar_canje); esto replica
 * las mismas reglas para mostrar vistas previas y validar formularios.
 *
 *   1 punto = $1 MXN de descuento, solo en el negocio donde se ganó.
 *   Los puntos no son dinero: no se retiran ni se transfieren.
 */

export type Nivel = "nuevo" | "confianza" | "vip";

export const NIVELES: Record<
  Nivel,
  { nombre: string; multiplicador: number; compras: number; beneficio: string }
> = {
  nuevo: { nombre: "Nuevo", multiplicador: 1, compras: 0, beneficio: "Puntos normales" },
  confianza: {
    nombre: "De confianza",
    multiplicador: 1.25,
    compras: 5,
    beneficio: "25% más puntos en cada compra",
  },
  vip: { nombre: "VIP", multiplicador: 1.5, compras: 20, beneficio: "50% más puntos en cada compra" },
};

/** Siguiente nivel y cuántas compras faltan para llegar (null si ya es VIP). */
export function siguienteNivel(nivel: Nivel, comprasPagadas: number) {
  const siguiente: Nivel | null = nivel === "nuevo" ? "confianza" : nivel === "confianza" ? "vip" : null;
  if (!siguiente) return null;
  return { nivel: siguiente, faltan: Math.max(0, NIVELES[siguiente].compras - comprasPagadas) };
}

export type ReglaPuntos = {
  porcentaje: number;
  tope_puntos: number | null;
  vigencia_dias: number | null;
  canje_max_porcentaje: number;
  activo: boolean;
};

const centavos = (n: number) => Math.round(n * 100) / 100;

/** Puntos que gana una compra pagada (igual que registrar_pago_pey). */
export function puntosGanados(montoPagado: number, regla: ReglaPuntos | null, nivel: Nivel) {
  if (!regla?.activo || montoPagado <= 0) return 0;
  const puntos = centavos(((montoPagado * regla.porcentaje) / 100) * NIVELES[nivel].multiplicador);
  return regla.tope_puntos != null ? Math.min(puntos, regla.tope_puntos) : puntos;
}

/** Máximo de puntos que se pueden usar en una compra de ese monto, dado el saldo. */
export function maximoCanje(monto: number, regla: ReglaPuntos | null, saldo: number) {
  if (!regla?.activo || monto <= 0 || saldo <= 0) return 0;
  const porRegla = Math.floor(((monto * regla.canje_max_porcentaje) / 100) * 100) / 100;
  return Math.min(porRegla, Math.floor(saldo * 100) / 100);
}

/** Valida el formulario de reglas del negocio. Devuelve errores por campo. */
export function erroresRegla(r: {
  porcentaje: number | null;
  tope_puntos: number | null;
  vigencia_dias: number | null;
  canje_max_porcentaje: number | null;
}) {
  const e: Partial<Record<keyof typeof r, string>> = {};
  if (r.porcentaje == null || !(r.porcentaje > 0) || r.porcentaje > 100)
    e.porcentaje = "Escribe un porcentaje entre 0.01 y 100.";
  else if (r.porcentaje > 20) e.porcentaje = "Más de 20% es demasiado para un changarro; usa 20 o menos.";
  if (r.tope_puntos != null && !(r.tope_puntos > 0)) e.tope_puntos = "El tope debe ser mayor a 0.";
  if (r.vigencia_dias != null && (!Number.isInteger(r.vigencia_dias) || r.vigencia_dias < 1))
    e.vigencia_dias = "Escribe días completos (1 o más).";
  if (r.canje_max_porcentaje == null || !(r.canje_max_porcentaje > 0) || r.canje_max_porcentaje > 90)
    e.canje_max_porcentaje = "Escribe un porcentaje entre 1 y 90.";
  return e;
}

/** Fecha en que vence el saldo si no hay más movimientos (null = no vence). */
export function fechaVencimiento(ultimoMovimiento: string | null, vigenciaDias: number | null) {
  if (!ultimoMovimiento || !vigenciaDias) return null;
  return new Date(new Date(ultimoMovimiento).getTime() + vigenciaDias * 86_400_000);
}

export const TIPO_MOVIMIENTO: Record<string, string> = {
  acumulacion: "Ganaste",
  canje: "Usaste",
  ajuste: "Ajuste",
  expiracion: "Vencieron",
};

/** "12.5" → "12.50"; enteros sin decimales. */
export function formatPuntos(n: number) {
  return Number.isInteger(n)
    ? n.toLocaleString("es-MX")
    : n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const correoValido = (c: string) => CORREO.test(c.trim());
