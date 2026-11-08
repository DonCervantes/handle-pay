import { describe, expect, it } from "vitest";
import {
  CLIENTES_EXTRA_DEMO,
  CUENTAS_DEMO,
  DOMINIO_DEMO,
  ORG_DUENA,
  ORG_RED,
  cuentaDemo,
  esCorreoDemo,
  esOrgDemo,
} from "@/lib/demo";

describe("cuentas de la demo (T13)", () => {
  it("todas las cuentas usan el dominio de demo, sin repetirse", () => {
    const correos = [...CUENTAS_DEMO, ...CLIENTES_EXTRA_DEMO].map((c) => c.email);
    for (const c of correos) expect(esCorreoDemo(c)).toBe(true);
    expect(new Set(correos).size).toBe(correos.length);
  });

  it("hay una cuenta por rol de la historia", () => {
    expect(CUENTAS_DEMO.map((c) => c.rol)).toEqual(["owner", "cajero", "cliente", "admin_red"]);
    expect(cuentaDemo("red").rol).toBe("admin_red");
    expect(() => cuentaDemo("otra" as never)).toThrow();
  });

  it("solo reconoce correos y organizaciones de la demo", () => {
    expect(esCorreoDemo(`Lupita@${DOMINIO_DEMO.toUpperCase()}`)).toBe(true);
    expect(esCorreoDemo("lupita@e2e.handle-prueba.mx")).toBe(false);
    expect(esCorreoDemo(`x@otro${DOMINIO_DEMO}`)).toBe(false);
    expect(esCorreoDemo(null)).toBe(false);
    expect(esOrgDemo(ORG_DUENA)).toBe(true);
    expect(esOrgDemo(ORG_RED)).toBe(true);
    expect(esOrgDemo("Tienda Prueba Pey")).toBe(false);
    expect(esOrgDemo("Demo sin separador")).toBe(false);
  });
});
