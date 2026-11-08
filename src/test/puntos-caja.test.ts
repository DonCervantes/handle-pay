import { describe, expect, it } from "vitest";
import { cobroParaCerrar, MARGEN_CIERRE_SEG, VIGENCIA_COBRO_SEG } from "@/lib/codi";
import {
  cobradoNeto,
  errorCanje,
  maximoCanje,
  resumenCobro,
  saldosDelMonedero,
  type ReglaPuntos,
} from "@/lib/puntos";

const regla: ReglaPuntos = {
  porcentaje: 10,
  tope_puntos: null,
  vigencia_dias: 90,
  canje_max_porcentaje: 50,
  activo: true,
};

describe("resumenCobro", () => {
  it("sin puntos cobra el total", () => {
    expect(resumenCobro(150, 0)).toEqual({ total: 150, descuento: 0, aCobrar: 150 });
  });
  it("resta el descuento por puntos", () => {
    expect(resumenCobro(150, 40.5)).toEqual({ total: 150, descuento: 40.5, aCobrar: 109.5 });
  });
  it("redondea a centavos", () => {
    expect(resumenCobro(10.1, 3.3).aCobrar).toBe(6.8);
  });
});

describe("errorCanje", () => {
  const maximo = maximoCanje(100, regla, 80); // 50
  it("vacío o cero no es error", () => {
    expect(errorCanje(0, maximo)).toBeNull();
    expect(errorCanje(null, maximo)).toBeNull();
  });
  it("acepta hasta el máximo", () => {
    expect(errorCanje(50, maximo)).toBeNull();
    expect(errorCanje(12, maximo)).toBeNull();
  });
  it("rechaza más del máximo", () => {
    expect(errorCanje(51, maximo)).toMatch(/máximo 50 puntos/);
  });
  it("solo acepta enteros: rechaza negativos, texto y decimales", () => {
    expect(errorCanje(-1, maximo)).toMatch(/número entero/);
    expect(errorCanje(Number.NaN, maximo)).toMatch(/número entero/);
    expect(errorCanje(12.25, maximo)).toMatch(/número entero/);
    expect(errorCanje(0.5, maximo)).toMatch(/número entero/);
  });
  it("el máximo que se muestra usa el piso del saldo", () => {
    const max = maximoCanje(1000, regla, 130.99);
    expect(max).toBe(130);
    expect(errorCanje(max, max)).toBeNull();
    expect(errorCanje(131, max)).toMatch(/máximo 130 puntos/);
  });
});

describe("cobradoNeto", () => {
  it("suma solo pagados, monto menos descuento (como Ventas del día)", () => {
    expect(
      cobradoNeto([
        { estado: "pagado", monto: "100.00", descuento_puntos: "20.00" },
        { estado: "pagado", monto: 35.5, descuento_puntos: 0 },
        { estado: "cancelado", monto: 500, descuento_puntos: 50 },
        { estado: "pendiente", monto: 80, descuento_puntos: 0 },
      ]),
    ).toBe(115.5);
  });
  it("sin cobros es 0", () => {
    expect(cobradoNeto([])).toBe(0);
  });
});

describe("cobroParaCerrar", () => {
  const creado = new Date("2026-11-08T12:00:00.000Z");
  const a = (seg: number) => new Date(creado.getTime() + seg * 1000);
  it("espera la vigencia más el margen (15 min, igual que vencer_cobros_pendientes)", () => {
    expect(VIGENCIA_COBRO_SEG + MARGEN_CIERRE_SEG).toBe(15 * 60);
    expect(cobroParaCerrar(creado, a(VIGENCIA_COBRO_SEG + 1))).toBe(false);
    expect(cobroParaCerrar(creado, a(15 * 60))).toBe(false);
    expect(cobroParaCerrar(creado, a(15 * 60 + 1))).toBe(true);
  });
});

describe("saldosDelMonedero", () => {
  const negocios = new Map([
    ["b1", "Tacos Don Pepe"],
    ["b2", "Abarrotes Lupita"],
  ]);
  const vigencias = new Map<string, number | null>([
    ["b1", 30],
    ["b2", null],
  ]);
  it("solo negocios con saldo, de mayor a menor, con vencimiento por inactividad", () => {
    const r = saldosDelMonedero(
      [
        { business_id: "b2", saldo: "12.50", ultimo_movimiento: "2026-11-01T00:00:00.000Z" },
        { business_id: "b1", saldo: 40, ultimo_movimiento: "2026-11-01T00:00:00.000Z" },
        { business_id: "b3", saldo: 0, ultimo_movimiento: "2026-11-01T00:00:00.000Z" },
        { business_id: null, saldo: 99, ultimo_movimiento: null },
      ],
      negocios,
      vigencias,
    );
    expect(r.map((s) => s.businessId)).toEqual(["b1", "b2"]);
    expect(r[0]).toMatchObject({
      negocio: "Tacos Don Pepe",
      saldo: 40,
      vigenciaDias: 30,
      venceEl: "2026-12-01T00:00:00.000Z",
    });
    expect(r[1]).toMatchObject({ negocio: "Abarrotes Lupita", saldo: 12.5, venceEl: null });
  });
  it("sin regla activa no vence y el nombre tiene respaldo", () => {
    const r = saldosDelMonedero(
      [{ business_id: "bx", saldo: 5, ultimo_movimiento: "2026-11-01T00:00:00.000Z" }],
      new Map(),
      new Map(),
    );
    expect(r[0]).toMatchObject({ negocio: "Negocio de la red", venceEl: null });
  });
});
