import { describe, expect, it } from "vitest";
import { respuestaSalud, revisarSalud } from "@/lib/salud";

const BASE = {
  SUPABASE_URL: "https://ejemplo.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_abc",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_no_debe_salir",
};

describe("revisarSalud", () => {
  it("ok en modo mock con Supabase configurado", () => {
    const s = revisarSalud(BASE, new Date("2026-11-07T00:00:00Z"));
    expect(s).toEqual({
      ok: true,
      servicio: "handle",
      pagos: "mock",
      faltan: [],
      demo: false,
      hora: "2026-11-07T00:00:00.000Z",
    });
  });

  it("con PAYMENTS_PROVIDER=pey exige la llave y el secreto del webhook", () => {
    const s = revisarSalud({ ...BASE, PAYMENTS_PROVIDER: "PEY", PEY_API_KEY: " " });
    expect(s.ok).toBe(false);
    expect(s.pagos).toBe("pey");
    expect(s.faltan).toEqual(["PEY_API_KEY", "PEY_WEBHOOK_SECRET"]);
  });

  it("cualquier valor distinto de pey se reporta como mock", () => {
    expect(revisarSalud({ ...BASE, PAYMENTS_PROVIDER: "otro" }).pagos).toBe("mock");
  });

  it("reporta nombres faltantes, nunca valores", async () => {
    const r = respuestaSalud({ SUPABASE_URL: BASE.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: BASE.SUPABASE_SERVICE_ROLE_KEY });
    expect(r.status).toBe(503);
    expect(r.headers.get("cache-control")).toBe("no-store");
    const texto = await r.text();
    expect(JSON.parse(texto).faltan).toEqual(["SUPABASE_PUBLISHABLE_KEY"]);
    expect(texto).not.toContain("sb_secret_");
    expect(texto).not.toContain("ejemplo.supabase.co");
  });
});
