import { describe, expect, it } from "vitest";
import {
  erroresRegla,
  fechaVencimiento,
  maximoCanje,
  puntosGanados,
  siguienteNivel,
  type ReglaPuntos,
} from "@/lib/puntos";

const regla: ReglaPuntos = {
  porcentaje: 10,
  tope_puntos: 30,
  vigencia_dias: 90,
  canje_max_porcentaje: 50,
  activo: true,
};

// Mismos casos que la prueba SQL de registrar_pago_pey / aplicar_canje.
describe("puntosGanados", () => {
  it("da el porcentaje de lo pagado", () => {
    expect(puntosGanados(200, regla, "nuevo")).toBe(20);
    expect(puntosGanados(35, regla, "nuevo")).toBe(3.5);
  });
  it("respeta el tope por compra", () => {
    expect(puntosGanados(1000, regla, "nuevo")).toBe(30);
  });
  it("multiplica por nivel", () => {
    expect(puntosGanados(100, regla, "confianza")).toBe(12.5);
    expect(puntosGanados(100, regla, "vip")).toBe(15);
  });
  it("sin regla activa no da puntos", () => {
    expect(puntosGanados(100, null, "vip")).toBe(0);
    expect(puntosGanados(100, { ...regla, activo: false }, "vip")).toBe(0);
  });
});

describe("maximoCanje", () => {
  it("limita al porcentaje de la compra", () => {
    expect(maximoCanje(60, regla, 50)).toBe(30);
  });
  it("limita al saldo", () => {
    expect(maximoCanje(100, regla, 28.5)).toBe(28.5);
  });
  it("trunca a centavos", () => {
    expect(maximoCanje(0.03, regla, 10)).toBe(0.01);
  });
  it("sin saldo o sin regla es 0", () => {
    expect(maximoCanje(100, regla, 0)).toBe(0);
    expect(maximoCanje(100, null, 50)).toBe(0);
  });
});

describe("niveles", () => {
  it("dice cuántas compras faltan", () => {
    expect(siguienteNivel("nuevo", 3)).toEqual({ nivel: "confianza", faltan: 2 });
    expect(siguienteNivel("confianza", 7)).toEqual({ nivel: "vip", faltan: 13 });
    expect(siguienteNivel("vip", 40)).toBeNull();
  });
});

describe("erroresRegla", () => {
  const base = { porcentaje: 5, tope_puntos: null, vigencia_dias: 180, canje_max_porcentaje: 50 };
  it("acepta una regla razonable", () => {
    expect(erroresRegla(base)).toEqual({});
  });
  it("rechaza valores fuera de rango", () => {
    expect(erroresRegla({ ...base, porcentaje: 0 }).porcentaje).toBeDefined();
    expect(erroresRegla({ ...base, porcentaje: 25 }).porcentaje).toBeDefined();
    expect(erroresRegla({ ...base, vigencia_dias: 1.5 }).vigencia_dias).toBeDefined();
    expect(erroresRegla({ ...base, canje_max_porcentaje: 95 }).canje_max_porcentaje).toBeDefined();
    expect(erroresRegla({ ...base, tope_puntos: 0 }).tope_puntos).toBeDefined();
  });
});

describe("fechaVencimiento", () => {
  it("suma la vigencia al último movimiento", () => {
    expect(fechaVencimiento("2026-01-01T00:00:00.000Z", 10)?.toISOString()).toBe(
      "2026-01-11T00:00:00.000Z",
    );
  });
  it("sin vigencia no vence", () => {
    expect(fechaVencimiento("2026-01-01T00:00:00.000Z", null)).toBeNull();
  });
});
