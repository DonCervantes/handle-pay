import { describe, expect, it } from "vitest";
import {
  calcularResumen,
  cambioPorcentual,
  claveDia,
  DIAS_RESUMEN,
  type CobroResumen,
  type MovimientoResumen,
} from "@/lib/resumen";

// Mediodía local para que ningún cobro cruce de día por zona horaria.
const AHORA = new Date(2026, 10, 7, 12, 0, 0);
const hace = (dias: number, hora = 10) =>
  new Date(2026, 10, 7 - dias, hora, 0, 0).toISOString();

let n = 0;
function cobro(p: Partial<CobroResumen> & { paid_at: string }): CobroResumen {
  n += 1;
  return {
    id: `c${n}`,
    monto: 100,
    descuento_puntos: 0,
    customer_id: null,
    cajero: "Lupe",
    ...p,
  };
}

describe("calcularResumen", () => {
  it("separa las ventas de hoy y las compara con ayer", () => {
    const r = calcularResumen(
      [
        cobro({ paid_at: hace(0), monto: 150, descuento_puntos: 30 }),
        cobro({ paid_at: hace(0, 11), monto: 60, cajero: "Toño" }),
        cobro({ paid_at: hace(1), monto: 120 }),
      ],
      [],
      AHORA,
    );
    expect(r.hoy.ventas).toBe(180); // 120 + 60: el descuento en puntos no entra por CoDi
    expect(r.hoy.cobros).toBe(2);
    expect(r.hoy.ticketPromedio).toBe(90);
    expect(r.hoy.cambioVsAyer).toBe(50);
    expect(r.hoy.porCajero).toEqual([
      { nombre: "Lupe", total: 120 },
      { nombre: "Toño", total: 60 },
    ]);
  });

  it("sin ventas hoy ni ayer no inventa ticket ni cambio", () => {
    const r = calcularResumen([], [], AHORA);
    expect(r.hoy.ventas).toBe(0);
    expect(r.hoy.ticketPromedio).toBeNull();
    expect(r.hoy.cambioVsAyer).toBeNull();
    expect(r.periodo.porcentajeRecurrentes).toBeNull();
    expect(r.ventasPorDia).toHaveLength(DIAS_RESUMEN);
    expect(r.ventasPorDia.every((d) => d.total === 0)).toBe(true);
  });

  it("arma la gráfica de 30 días con hoy al final e ignora lo más viejo", () => {
    const r = calcularResumen(
      [
        cobro({ paid_at: hace(0), monto: 50 }),
        cobro({ paid_at: hace(29), monto: 70 }),
        cobro({ paid_at: hace(30), monto: 999 }),
      ],
      [],
      AHORA,
    );
    expect(r.ventasPorDia.at(-1)).toMatchObject({ dia: claveDia(AHORA), total: 50 });
    expect(r.ventasPorDia[0]!.total).toBe(70);
    expect(r.periodo.ventas).toBe(120);
    expect(r.periodo.cobros).toBe(2);
  });

  it("cuenta puntos entregados del ledger y canjeados de los cobros pagados", () => {
    const movimientos: MovimientoResumen[] = [
      { tipo: "acumulacion", puntos: 12, created_at: hace(0) },
      { tipo: "acumulacion", puntos: 8, created_at: hace(3) },
      { tipo: "canje", puntos: -30, created_at: hace(0) },
      { tipo: "ajuste", puntos: 30, created_at: hace(0) },
      { tipo: "acumulacion", puntos: 500, created_at: hace(40) },
    ];
    const r = calcularResumen(
      [cobro({ paid_at: hace(0), descuento_puntos: 25 }), cobro({ paid_at: hace(2), descuento_puntos: 5 })],
      movimientos,
      AHORA,
    );
    expect(r.periodo.puntosEmitidos).toBe(20);
    expect(r.periodo.puntosCanjeados).toBe(30);
  });

  it("clientes que regresan: 2 o más compras en el periodo", () => {
    const r = calcularResumen(
      [
        cobro({ paid_at: hace(0), customer_id: "ana" }),
        cobro({ paid_at: hace(5), customer_id: "ana" }),
        cobro({ paid_at: hace(1), customer_id: "beto" }),
        cobro({ paid_at: hace(2), customer_id: "caro" }),
        cobro({ paid_at: hace(3), customer_id: "caro" }),
        cobro({ paid_at: hace(3), customer_id: "caro" }),
        cobro({ paid_at: hace(4) }),
      ],
      [],
      AHORA,
    );
    expect(r.periodo.clientes).toBe(3);
    expect(r.periodo.recurrentes).toBe(2);
    expect(r.periodo.porcentajeRecurrentes).toBe(67);
  });

  it("últimos cobros: los 6 más recientes primero", () => {
    const cobros = Array.from({ length: 8 }, (_, i) => cobro({ paid_at: hace(i) }));
    const r = calcularResumen(cobros.reverse(), [], AHORA);
    expect(r.ultimos).toHaveLength(6);
    expect(r.ultimos[0]!.paid_at).toBe(hace(0));
  });
});

describe("cambioPorcentual", () => {
  it("redondea y no divide entre cero", () => {
    expect(cambioPorcentual(110, 100)).toBe(10);
    expect(cambioPorcentual(50, 100)).toBe(-50);
    expect(cambioPorcentual(10, 0)).toBeNull();
  });
});
