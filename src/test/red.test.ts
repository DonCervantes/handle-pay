import { describe, expect, it } from "vitest";
import { aprobadosInactivos, negociosVisibles, type NegocioRed } from "@/lib/red";

const n = (id: string, estado_kyb: NegocioRed["estado_kyb"], activo: boolean) => ({
  id,
  estado_kyb,
  activo,
});
const NEGOCIOS = [
  n("a", "aprobado", true),
  n("b", "aprobado", false),
  n("c", "en_revision", false),
  n("d", "rechazado", false),
  n("e", "aprobado", true),
];
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe("cola de la red: aprobados inactivos (T23)", () => {
  it("en Aprobados oculta los inactivos por defecto", () => {
    expect(ids(negociosVisibles(NEGOCIOS, "aprobado", false))).toEqual(["a", "e"]);
  });

  it("con el interruptor muestra también los inactivos", () => {
    expect(ids(negociosVisibles(NEGOCIOS, "aprobado", true))).toEqual(["a", "b", "e"]);
    expect(aprobadosInactivos(NEGOCIOS)).toBe(1);
  });

  it("los demás filtros no cambian", () => {
    expect(ids(negociosVisibles(NEGOCIOS, "en_revision", false))).toEqual(["c"]);
    expect(ids(negociosVisibles(NEGOCIOS, "rechazado", false))).toEqual(["d"]);
    expect(ids(negociosVisibles(NEGOCIOS, "todos", false))).toHaveLength(5);
  });
});
