// Cálculos del resumen del negocio (/dashboard). Funciones puras, sin red ni
// Supabase: reciben los cobros pagados y los movimientos de puntos que la base ya
// filtró por RLS y devuelven las cifras que ve el dueño. Probadas en Vitest.

/** Cobro pagado tal como lo lee el resumen. */
export type CobroResumen = {
  id: string;
  monto: number | string;
  descuento_puntos: number | string;
  paid_at: string | null;
  customer_id: string | null;
  cajero: string | null;
  cliente?: string | null;
};

/** Movimiento del ledger de puntos tal como lo lee el resumen. */
export type MovimientoResumen = {
  tipo: "acumulacion" | "canje" | "ajuste" | "expiracion";
  puntos: number | string;
  created_at: string;
};

/** Días que cubre el resumen (gráfica, puntos y clientes recurrentes). */
export const DIAS_RESUMEN = 30;

/** Lo que entra por CoDi: el monto menos lo que se pagó con puntos. */
export function cobrado(c: Pick<CobroResumen, "monto" | "descuento_puntos">) {
  return Number(c.monto) - Number(c.descuento_puntos);
}

/** Fecha local AAAA-MM-DD (el "día" del changarro, no el de UTC). */
export function claveDia(fecha: Date) {
  const a = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  return `${a}-${m}-${d}`;
}

/** Inicio (00:00 local) del día que está `dias` días antes de `ahora`. */
export function inicioDeDia(ahora: Date, diasAtras = 0) {
  return new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - diasAtras);
}

function suma(cobros: CobroResumen[]) {
  return cobros.reduce((s, c) => s + cobrado(c), 0);
}

/** Cambio porcentual redondeado; null si no hay base para comparar. */
export function cambioPorcentual(actual: number, anterior: number) {
  if (anterior <= 0) return null;
  return Math.round(((actual - anterior) / anterior) * 100);
}

export type Resumen = ReturnType<typeof calcularResumen>;

export function calcularResumen(
  cobros: CobroResumen[],
  movimientos: MovimientoResumen[],
  ahora = new Date(),
) {
  const hoy = claveDia(ahora);
  const ayer = claveDia(inicioDeDia(ahora, 1));
  const desde = inicioDeDia(ahora, DIAS_RESUMEN - 1).getTime();

  const pagados = cobros.filter((c) => c.paid_at && new Date(c.paid_at).getTime() >= desde);
  const delDia = (clave: string) => pagados.filter((c) => claveDia(new Date(c.paid_at!)) === clave);
  const deHoy = delDia(hoy);
  const deAyer = delDia(ayer);

  const ventasHoy = suma(deHoy);
  const ventasAyer = suma(deAyer);

  // Ventas por día, del más viejo a hoy, con los días sin ventas en cero.
  const porDia = new Map<string, number>();
  for (let i = DIAS_RESUMEN - 1; i >= 0; i--) porDia.set(claveDia(inicioDeDia(ahora, i)), 0);
  for (const c of pagados) {
    const k = claveDia(new Date(c.paid_at!));
    if (porDia.has(k)) porDia.set(k, porDia.get(k)! + cobrado(c));
  }
  const ventasPorDia = [...porDia].map(([dia, total]) => ({
    dia,
    etiqueta: new Date(`${dia}T12:00:00`).toLocaleDateString("es-MX", {
      day: "numeric",
      month: "short",
    }),
    total: Math.round(total * 100) / 100,
  }));

  // Puntos: emitidos según el ledger; canjeados = descuento de los cobros pagados
  // (si el cobro se canceló, el canje se devolvió y no cuenta).
  const recientes = movimientos.filter((m) => new Date(m.created_at).getTime() >= desde);
  const puntosEmitidos = recientes
    .filter((m) => m.tipo === "acumulacion")
    .reduce((s, m) => s + Number(m.puntos), 0);
  const puntosCanjeados = pagados.reduce((s, c) => s + Number(c.descuento_puntos), 0);

  // Clientes identificados y cuántos volvieron (2 o más compras en el periodo).
  const comprasPorCliente = new Map<string, number>();
  for (const c of pagados) {
    if (c.customer_id) comprasPorCliente.set(c.customer_id, (comprasPorCliente.get(c.customer_id) ?? 0) + 1);
  }
  const clientes = comprasPorCliente.size;
  const recurrentes = [...comprasPorCliente.values()].filter((n) => n >= 2).length;

  const porCajero = new Map<string, number>();
  for (const c of deHoy) {
    const nombre = c.cajero ?? "Sin nombre";
    porCajero.set(nombre, (porCajero.get(nombre) ?? 0) + cobrado(c));
  }

  return {
    hoy: {
      ventas: ventasHoy,
      cobros: deHoy.length,
      ticketPromedio: deHoy.length ? ventasHoy / deHoy.length : null,
      cambioVsAyer: cambioPorcentual(ventasHoy, ventasAyer),
      porCajero: [...porCajero]
        .map(([nombre, total]) => ({ nombre, total }))
        .sort((a, b) => b.total - a.total),
    },
    periodo: {
      ventas: suma(pagados),
      cobros: pagados.length,
      puntosEmitidos,
      puntosCanjeados,
      clientes,
      recurrentes,
      porcentajeRecurrentes: clientes ? Math.round((recurrentes / clientes) * 100) : null,
    },
    ventasPorDia,
    ultimos: [...pagados]
      .sort((a, b) => new Date(b.paid_at!).getTime() - new Date(a.paid_at!).getTime())
      .slice(0, 6),
  };
}
