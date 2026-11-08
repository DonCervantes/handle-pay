import { describe, expect, it } from "vitest";
import {
  busquedaClientes,
  filtrarClientes,
  nombreCliente,
  resumirClientes,
  saldoVigente,
  totalesClientes,
} from "@/lib/clientes";

const ahora = new Date("2026-11-08T12:00:00Z");

const fichas = [
  { id: "a", nombre: "Mariana López", email: "mariana@x.mx", nivel: "vip" },
  { id: "b", nombre: "José Pérez", email: "jose@x.mx", nivel: "confianza" },
  { id: "c", nombre: null, email: "vecino@x.mx", nivel: "nuevo" },
  { id: "d", nombre: "Sin actividad", email: "d@x.mx", nivel: "nuevo" },
];

const cobro = (customer_id: string | null, monto: number, fecha: string, extra = {}) => ({
  customer_id,
  estado: "pagado",
  monto,
  descuento_puntos: 0,
  paid_at: fecha,
  created_at: fecha,
  ...extra,
});

const cobros = [
  cobro("a", 100, "2026-11-01T10:00:00Z"),
  cobro("a", 50.5, "2026-11-07T10:00:00Z", { descuento_puntos: 10 }),
  cobro("a", 999, "2026-11-08T10:00:00Z", { estado: "cancelado" }),
  cobro("b", 30, "2026-11-05T10:00:00Z"),
  cobro(null, 80, "2026-11-06T10:00:00Z"),
  cobro("zz", 80, "2026-11-06T10:00:00Z"), // sin ficha: se ignora
];

const saldos = [
  { customer_id: "a", business_id: "n1", saldo: "12.5", ultimo_movimiento: "2026-11-07T10:00:00Z" },
  // Vencido: 30 días de vigencia y su último movimiento fue hace 40.
  { customer_id: "c", business_id: "n1", saldo: 7, ultimo_movimiento: "2026-09-29T10:00:00Z" },
];
const vigencias = new Map([["n1", 30]]);

describe("resumirClientes", () => {
  const lista = resumirClientes(fichas, cobros, saldos, vigencias, ahora);
  const de = (id: string) => lista.find((c) => c.id === id)!;

  it("solo incluye clientes con cobros pagados o puntos en el negocio", () => {
    expect(lista.map((c) => c.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("cuenta compras pagadas, total neto y visitas", () => {
    expect(de("a")).toMatchObject({
      compras: 2,
      totalGastado: 140.5,
      puntos: 12.5,
      ultimaVisita: "2026-11-07T10:00:00Z",
      primeraVisita: "2026-11-01T10:00:00Z",
      nivel: "vip",
    });
    expect(de("b")).toMatchObject({ compras: 1, totalGastado: 30, puntos: 0 });
  });

  it("los puntos vencidos por inactividad cuentan 0", () => {
    expect(de("c")).toMatchObject({ compras: 0, puntos: 0, ultimaVisita: null });
  });
});

describe("saldoVigente", () => {
  it("sin vigencia no vence", () => {
    expect(saldoVigente(5, "2020-01-01T00:00:00Z", null, ahora)).toBe(5);
  });
  it("saldo vacío o negativo es 0", () => {
    expect(saldoVigente(null, null, null, ahora)).toBe(0);
    expect(saldoVigente(-3, null, null, ahora)).toBe(0);
  });
});

describe("filtrarClientes", () => {
  const lista = resumirClientes(fichas, cobros, saldos, vigencias, ahora);

  it("busca por nombre o correo sin importar acentos ni mayúsculas", () => {
    expect(filtrarClientes(lista, { q: "JOSE", nivel: "", orden: "reciente" }).map((c) => c.id)).toEqual(["b"]);
    expect(filtrarClientes(lista, { q: "vecino@", nivel: "", orden: "reciente" }).map((c) => c.id)).toEqual(["c"]);
  });

  it("filtra por nivel", () => {
    expect(filtrarClientes(lista, { q: "", nivel: "vip", orden: "reciente" }).map((c) => c.id)).toEqual(["a"]);
  });

  it("ordena por visita, gasto y nombre", () => {
    expect(filtrarClientes(lista, { q: "", nivel: "", orden: "reciente" }).map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(filtrarClientes(lista, { q: "", nivel: "", orden: "gasto" }).map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(filtrarClientes(lista, { q: "", nivel: "", orden: "nombre" }).map((c) => c.id)).toEqual(["b", "a", "c"]);
  });
});

describe("busquedaClientes", () => {
  it("normaliza valores desconocidos", () => {
    expect(busquedaClientes({ q: 3, nivel: "oro", orden: "x" })).toEqual({ q: "", nivel: "", orden: "reciente" });
    expect(busquedaClientes({ q: "ana", nivel: "vip", orden: "puntos" })).toEqual({ q: "ana", nivel: "vip", orden: "puntos" });
  });
});

describe("totales y nombre", () => {
  it("cuenta recurrentes (2+ compras) y suma el piso de los puntos de cada cliente", () => {
    const lista = resumirClientes(fichas, cobros, saldos, vigencias, ahora);
    expect(totalesClientes(lista)).toEqual({ clientes: 3, recurrentes: 1, puntos: 12 });
    // 0.6 + 0.6 = 1.2 exactos, pero ninguno de los dos completa un punto.
    const dos = lista.slice(0, 2).map((c) => ({ ...c, puntos: 0.6 }));
    expect(totalesClientes(dos).puntos).toBe(0);
  });
  it("sin nombre usa la parte del correo", () => {
    expect(nombreCliente({ nombre: null, email: "vecino@x.mx" })).toBe("vecino");
    expect(nombreCliente({ nombre: "  ", email: "v@x.mx" })).toBe("v");
  });
});
