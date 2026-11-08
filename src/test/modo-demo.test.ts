import { describe, expect, it } from "vitest";
import { correoDePerfil, esCorreoDemo, modoDemoActivo, PERFILES_DEMO } from "@/lib/modo-demo";
import { revisarSalud } from "@/lib/salud";
import { esRutaPublica } from "@/lib/roles";

const BASE = {
  SUPABASE_URL: "https://ejemplo.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abc",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_x",
};

describe("modoDemoActivo", () => {
  it("apagado por defecto", () => {
    expect(modoDemoActivo({}, true)).toBe(false);
    expect(modoDemoActivo({ DEMO_MODE: "false" }, true)).toBe(false);
    expect(modoDemoActivo({ DEMO_MODE: "1" }, true)).toBe(false);
  });

  it("encendido solo con DEMO_MODE=true, en desarrollo y con el simulador", () => {
    expect(modoDemoActivo({ DEMO_MODE: "true" }, true)).toBe(true);
    expect(modoDemoActivo({ DEMO_MODE: " TRUE ", PAYMENTS_PROVIDER: "mock" }, true)).toBe(true);
  });

  it("nunca en el build de producción, aunque DEMO_MODE=true", () => {
    expect(modoDemoActivo({ DEMO_MODE: "true", PAYMENTS_PROVIDER: "mock" }, false)).toBe(false);
  });

  it("nunca con pagos reales", () => {
    expect(modoDemoActivo({ DEMO_MODE: "true", PAYMENTS_PROVIDER: "pey" }, true)).toBe(false);
  });
});

describe("esCorreoDemo", () => {
  it("solo acepta @demo.handle-prueba.mx", () => {
    expect(esCorreoDemo("duena@demo.handle-prueba.mx")).toBe(true);
    expect(esCorreoDemo(" Duena@Demo.Handle-Prueba.mx ")).toBe(true);
    for (const correo of [
      "duena@e2e.handle-prueba.mx",
      "duena-pey@handle-prueba.mx",
      "x@demo.handle-prueba.mx.evil.com",
      "x@evil.com@demo.handle-prueba.mx",
      "@demo.handle-prueba.mx",
      "",
      null,
    ]) {
      expect(esCorreoDemo(correo), String(correo)).toBe(false);
    }
  });

  it("todos los perfiles de /demo usan cuentas de demo", () => {
    for (const perfil of PERFILES_DEMO) expect(esCorreoDemo(correoDePerfil(perfil)), perfil).toBe(true);
  });
});

describe("salud y rutas", () => {
  it("/api/health reporta demo=false en producción aunque DEMO_MODE=true", () => {
    expect(revisarSalud({ ...BASE, DEMO_MODE: "true" }).demo).toBe(false);
    expect(revisarSalud({ ...BASE, DEMO_MODE: "true" }, new Date(), true).demo).toBe(true);
  });

  it("/demo es pública (sin sesión)", () => {
    expect(esRutaPublica("/demo")).toBe(true);
  });
});
