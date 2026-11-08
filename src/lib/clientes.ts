/**
 * T21 · Clientes del changarro: quienes compraron (o tienen puntos) en el negocio de la
 * organización. Funciones puras, seguras para el navegador; el servidor
 * (clientes.functions.ts) lee los datos ya filtrados por la org de quien llama.
 */
import { fechaVencimiento, pisoPuntos, type Nivel } from "./puntos";

export const NIVELES_FILTRO = ["nuevo", "confianza", "vip"] as const satisfies readonly Nivel[];

export const ORDENES = [
  { valor: "reciente", etiqueta: "Visita más reciente" },
  { valor: "gasto", etiqueta: "Mayor gasto" },
  { valor: "compras", etiqueta: "Más compras" },
  { valor: "puntos", etiqueta: "Más puntos" },
  { valor: "nombre", etiqueta: "Nombre (A–Z)" },
] as const;
export type Orden = (typeof ORDENES)[number]["valor"];

export type BusquedaClientes = { q: string; nivel: "" | Nivel; orden: Orden };

/** Normaliza los parámetros de la URL de /clientes (valores desconocidos → por defecto). */
export function busquedaClientes(s: Record<string, unknown>): BusquedaClientes {
  const q = typeof s["q"] === "string" ? s["q"].slice(0, 100) : "";
  const nivel = (NIVELES_FILTRO as readonly string[]).includes(String(s["nivel"]))
    ? (s["nivel"] as Nivel)
    : "";
  const orden = ORDENES.some((o) => o.valor === s["orden"]) ? (s["orden"] as Orden) : "reciente";
  return { q, nivel, orden };
}

export type ClienteDelNegocio = {
  id: string;
  nombre: string | null;
  email: string;
  nivel: Nivel;
  /** Cobros pagados en este negocio. */
  compras: number;
  /** Lo que pagó por CoDi en este negocio (monto − descuento por puntos). */
  totalGastado: number;
  /** Saldo vigente de puntos en este negocio. */
  puntos: number;
  /** Fecha del último cobro pagado (ISO) o null. */
  ultimaVisita: string | null;
  /** Fecha del primer cobro pagado (ISO) o null. */
  primeraVisita: string | null;
};

type CobroFila = {
  customer_id: string | null;
  estado: string;
  monto: number | string;
  descuento_puntos: number | string;
  paid_at: string | null;
  created_at: string;
};
type SaldoFila = {
  customer_id: string | null;
  business_id: string | null;
  saldo: number | string | null;
  ultimo_movimiento: string | null;
};
type ClienteFila = { id: string; nombre: string | null; email: string; nivel: string };

const centavos = (n: number) => Math.round(n * 100) / 100;

/**
 * Saldo que el cliente todavía puede usar: si ya pasó la vigencia por inactividad,
 * cuenta 0 (la base lo marca vencido en su próximo movimiento). Sin escribir nada.
 */
export function saldoVigente(
  saldo: number | string | null,
  ultimoMovimiento: string | null,
  vigenciaDias: number | null,
  ahora: Date = new Date(),
) {
  const n = Number(saldo ?? 0);
  if (!(n > 0)) return 0;
  const vence = fechaVencimiento(ultimoMovimiento, vigenciaDias);
  return vence && vence.getTime() <= ahora.getTime() ? 0 : n;
}

/**
 * Arma la lista de clientes del negocio a partir de los cobros y saldos de la org.
 * Solo aparecen clientes con al menos un cobro pagado o un saldo de puntos registrado.
 */
export function resumirClientes(
  clientes: readonly ClienteFila[],
  cobros: readonly CobroFila[],
  saldos: readonly SaldoFila[],
  vigencias: ReadonlyMap<string, number | null>,
  ahora: Date = new Date(),
): ClienteDelNegocio[] {
  const porId = new Map<string, ClienteDelNegocio>();
  for (const c of clientes) {
    porId.set(c.id, {
      id: c.id,
      nombre: c.nombre,
      email: c.email,
      nivel: (NIVELES_FILTRO as readonly string[]).includes(c.nivel) ? (c.nivel as Nivel) : "nuevo",
      compras: 0,
      totalGastado: 0,
      puntos: 0,
      ultimaVisita: null,
      primeraVisita: null,
    });
  }
  const conActividad = new Set<string>();
  for (const cobro of cobros) {
    if (cobro.estado !== "pagado" || !cobro.customer_id) continue;
    const c = porId.get(cobro.customer_id);
    if (!c) continue;
    conActividad.add(c.id);
    c.compras += 1;
    c.totalGastado = centavos(c.totalGastado + Number(cobro.monto) - Number(cobro.descuento_puntos));
    const fecha = cobro.paid_at ?? cobro.created_at;
    if (!c.ultimaVisita || fecha > c.ultimaVisita) c.ultimaVisita = fecha;
    if (!c.primeraVisita || fecha < c.primeraVisita) c.primeraVisita = fecha;
  }
  for (const s of saldos) {
    if (!s.customer_id) continue;
    const c = porId.get(s.customer_id);
    if (!c) continue;
    conActividad.add(c.id);
    const vigencia = s.business_id ? (vigencias.get(s.business_id) ?? null) : null;
    c.puntos = centavos(c.puntos + saldoVigente(s.saldo, s.ultimo_movimiento, vigencia, ahora));
  }
  return [...porId.values()].filter((c) => conActividad.has(c.id));
}

const sinAcentos = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

/** Filtra por texto (nombre o correo, sin importar acentos) y nivel, y ordena. */
export function filtrarClientes(
  clientes: readonly ClienteDelNegocio[],
  { q, nivel, orden }: BusquedaClientes,
): ClienteDelNegocio[] {
  const texto = sinAcentos(q);
  const filtrados = clientes.filter(
    (c) =>
      (!nivel || c.nivel === nivel) &&
      (!texto || sinAcentos(`${c.nombre ?? ""} ${c.email}`).includes(texto)),
  );
  const nombre = (c: ClienteDelNegocio) => sinAcentos(c.nombre ?? c.email);
  const comparar: Record<Orden, (a: ClienteDelNegocio, b: ClienteDelNegocio) => number> = {
    reciente: (a, b) => (b.ultimaVisita ?? "").localeCompare(a.ultimaVisita ?? ""),
    gasto: (a, b) => b.totalGastado - a.totalGastado,
    compras: (a, b) => b.compras - a.compras,
    puntos: (a, b) => b.puntos - a.puntos,
    nombre: (a, b) => nombre(a).localeCompare(nombre(b), "es-MX"),
  };
  return [...filtrados].sort((a, b) => comparar[orden](a, b) || nombre(a).localeCompare(nombre(b), "es-MX"));
}

/**
 * Totales para el encabezado de /clientes. Los puntos suman el piso de cada cliente
 * (lo que cada uno puede usar), así el total cuadra con lo que se ve en la tabla.
 */
export function totalesClientes(clientes: readonly ClienteDelNegocio[]) {
  return {
    clientes: clientes.length,
    recurrentes: clientes.filter((c) => c.compras >= 2).length,
    puntos: clientes.reduce((s, c) => s + pisoPuntos(c.puntos), 0),
  };
}

/** Nombre a mostrar: el registrado o la parte del correo antes de la @. */
export function nombreCliente(c: { nombre: string | null; email: string }) {
  return c.nombre?.trim() || c.email.split("@")[0];
}
