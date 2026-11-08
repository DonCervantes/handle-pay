import { describe, expect, it } from "vitest";
import {
  erroresRegla,
  fechaVencimiento,
  formatPuntos,
  maximoCanje,
  pisoPuntos,
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
  it("limita al piso del saldo (solo puntos enteros)", () => {
    expect(maximoCanje(100, regla, 28.5)).toBe(28);
    expect(maximoCanje(100, regla, 130.99)).toBe(50);
    expect(maximoCanje(500, regla, 130.99)).toBe(130);
    expect(maximoCanje(100, regla, 0.4)).toBe(0);
  });
  it("redondea hacia abajo el tope por regla", () => {
    expect(maximoCanje(0.03, regla, 10)).toBe(0);
    expect(maximoCanje(25, regla, 100)).toBe(12);
    expect(Number.isInteger(maximoCanje(33.33, regla, 99.99))).toBe(true);
  });
  it("sin saldo o sin regla es 0", () => {
    expect(maximoCanje(100, regla, 0)).toBe(0);
    expect(maximoCanje(100, null, 50)).toBe(0);
  });
});

describe("formatPuntos (T22: sin decimales, hacia abajo)", () => {
  it("bordes que pidió Dylan", () => {
    expect(formatPuntos(130.99)).toBe("130");
    expect(formatPuntos(0.4)).toBe("0");
  });
  it("enteros, cero y miles", () => {
    expect(formatPuntos(0)).toBe("0");
    expect(formatPuntos(20)).toBe("20");
    expect(formatPuntos(1234.5)).toBe("1,234");
    expect(formatPuntos(999.999)).toBe("999");
  });
  it("acepta el texto numeric que regresa Supabase", () => {
    expect(formatPuntos("130.99")).toBe("130");
    expect(formatPuntos("12.50")).toBe("12");
  });
  it("valores raros no rompen la pantalla", () => {
    expect(formatPuntos(null)).toBe("0");
    expect(formatPuntos(undefined)).toBe("0");
    expect(formatPuntos(Number.NaN)).toBe("0");
    expect(formatPuntos("abc")).toBe("0");
  });
  it("absorbe errores de punto flotante al sumar", () => {
    const suma = [0.1, 0.2, 0.3, 0.4].reduce((s, n) => s + n, 0) * 100; // 99.99999999999999
    expect(formatPuntos(suma)).toBe("100");
    expect(formatPuntos(0.1 + 0.2 + 0.7)).toBe("1");
  });
  it("negativos: hacia cero y sin '-0'", () => {
    expect(pisoPuntos(-12.7)).toBe(-12);
    expect(formatPuntos(-0.4)).toBe("0");
    expect(Object.is(pisoPuntos(-0.4), -0)).toBe(false);
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
