import { describe, expect, it } from "vitest";
import {
  CLIENTES_EXTRA_DEMO,
  CUENTAS_DEMO,
  DOMINIO_DEMO,
  NEGOCIOS_EN_REVISION_DEMO,
  ORG_DUENA,
  ORG_RED,
  PREFIJO_ORG_DEMO_ANTERIOR,
  correoDuenoDemo,
  cuentaDemo,
  esCorreoDemo,
  esOrgDemo,
} from "@/lib/demo";

describe("cuentas de la demo (T13)", () => {
  it("todas las cuentas usan el dominio de demo, sin repetirse", () => {
    const correos = [
      ...CUENTAS_DEMO.map((c) => c.email),
      ...CLIENTES_EXTRA_DEMO.map((c) => c.email),
      correoDuenoDemo("tacos-el-guero"),
    ];
    for (const c of correos) expect(esCorreoDemo(c)).toBe(true);
    expect(new Set(correos).size).toBe(correos.length);
  });

  it("hay una cuenta por rol de la historia", () => {
    expect(CUENTAS_DEMO.map((c) => c.rol)).toEqual(["owner", "cajero", "cliente", "admin_red"]);
    expect(cuentaDemo("red").rol).toBe("admin_red");
    expect(() => cuentaDemo("otra" as never)).toThrow();
  });

  it("solo reconoce correos de la demo", () => {
    expect(esCorreoDemo(`Lupita@${DOMINIO_DEMO.toUpperCase()}`)).toBe(true);
    expect(esCorreoDemo("lupita@e2e.handle-prueba.mx")).toBe(false);
    expect(esCorreoDemo(`x@otro${DOMINIO_DEMO}`)).toBe(false);
    expect(esCorreoDemo(null)).toBe(false);
  });
});

describe("marca invisible de la demo (T23)", () => {
  it("los nombres que se ven en la app no llevan 'Demo'", () => {
    for (const nombre of [ORG_DUENA, ORG_RED, ...NEGOCIOS_EN_REVISION_DEMO]) {
      expect(nombre).not.toMatch(/demo/i);
    }
  });

  it("una organización es de la demo si todos sus miembros (al menos uno) son de la demo", () => {
    const demo = (u: string) => `${u}@${DOMINIO_DEMO}`;
    expect(esOrgDemo({ nombre: ORG_DUENA, correosMiembros: [demo("lupita"), demo("beto")] })).toBe(
      true,
    );
    // Un solo miembro ajeno basta para no tocarla, aunque se llame igual que la de la demo.
    expect(
      esOrgDemo({ nombre: ORG_DUENA, correosMiembros: [demo("lupita"), "duena@gmail.com"] }),
    ).toBe(false);
    expect(esOrgDemo({ nombre: ORG_DUENA, correosMiembros: [null] })).toBe(false);
    // Sin miembros y sin la marca anterior: no se puede saber, no es de la demo.
    expect(esOrgDemo({ nombre: "Abarrotes Doña Lupita", correosMiembros: [] })).toBe(false);
    expect(
      esOrgDemo({ nombre: "Tienda Prueba Pey", correosMiembros: ["x@e2e.handle-prueba.mx"] }),
    ).toBe(false);
  });

  it("todavía reconoce las organizaciones con la marca anterior para poder limpiarlas", () => {
    const anterior = `${PREFIJO_ORG_DEMO_ANTERIOR}Tacos El Güero`;
    expect(esOrgDemo({ nombre: anterior, correosMiembros: [] })).toBe(true);
    expect(esOrgDemo({ nombre: anterior, correosMiembros: ["alguien@gmail.com"] })).toBe(false);
    expect(esOrgDemo({ nombre: "Demo sin separador", correosMiembros: [] })).toBe(false);
  });
});
