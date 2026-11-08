import { describe, expect, it } from "vitest";
import {
  cobroVencido,
  conceptoCobro,
  leerMonto,
  telefonoValido,
  validarClabe,
  VIGENCIA_COBRO_SEG,
} from "@/lib/codi";
import { firmarWebhook, verificarWebhook } from "@/lib/standard-webhooks";

describe("validarClabe", () => {
  it("acepta CLABEs con dígito verificador correcto", () => {
    // Ejemplo de la documentación de Pey (bank.account.updated).
    expect(validarClabe("012180001234567899")).toBeNull();
    expect(validarClabe("0121 8000 1234 5678 99")).toBeNull();
  });
  it("detecta un dígito mal capturado", () => {
    expect(validarClabe("012180001234567890")).toMatch(/verificador/);
    expect(validarClabe("012180001234567989")).toMatch(/verificador/);
  });
  it("exige 18 dígitos", () => {
    expect(validarClabe("01218000123")).toMatch(/18 dígitos/);
  });
});

describe("montos, teléfono y concepto", () => {
  it("lee montos en pesos", () => {
    expect(leerMonto("85.50")).toBe(85.5);
    expect(leerMonto("$1,250")).toBe(1250);
    expect(leerMonto("0")).toBeNull();
    expect(leerMonto("10.555")).toBeNull();
    expect(leerMonto("abc")).toBeNull();
    expect(leerMonto("1000001")).toBeNull();
  });
  it("valida celulares de 10 dígitos", () => {
    expect(telefonoValido("55 1234 5678")).toBe("5512345678");
    expect(telefonoValido("12345")).toBeNull();
  });
  it("arma un concepto corto", () => {
    expect(conceptoCobro("Tacos El Güero")).toBe("Tacos El Güero");
    expect(conceptoCobro("Tacos El Güero", "3 de pastor")).toBe("Tacos El Güero · 3 de pastor");
    expect(conceptoCobro("x".repeat(60)).length).toBe(40);
  });
  it("sabe cuándo vence un cobro", () => {
    const ahora = new Date("2026-11-08T12:00:00Z");
    expect(cobroVencido(new Date(ahora.getTime() - 60_000), ahora)).toBe(false);
    expect(cobroVencido(new Date(ahora.getTime() - (VIGENCIA_COBRO_SEG + 1) * 1000), ahora)).toBe(
      true,
    );
  });
});

describe("Standard Webhooks", () => {
  // Vector de prueba publicado por Standard Webhooks / Svix.
  const secreto = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
  const id = "msg_p5jXN8AQM9LWM0D4loKWxJek";
  const timestamp = 1614265330;
  const cuerpo = '{"test": 2432232314}';
  const firmaOficial = "v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=";

  it("firma igual que el vector oficial", async () => {
    expect(await firmarWebhook(secreto, id, timestamp, cuerpo)).toBe(firmaOficial);
  });

  it("acepta la firma válida (también entre varias)", async () => {
    const enc = { id, timestamp: String(timestamp), firma: `v1,otra= ${firmaOficial}` };
    expect(await verificarWebhook(secreto, enc, cuerpo, timestamp + 10)).toBe(true);
  });

  it("rechaza cuerpo alterado, secreto equivocado o encabezados faltantes", async () => {
    const enc = { id, timestamp: String(timestamp), firma: firmaOficial };
    expect(await verificarWebhook(secreto, enc, '{"test": 1}', timestamp)).toBe(false);
    expect(
      await verificarWebhook("whsec_" + btoa("otro-secreto-cualquiera"), enc, cuerpo, timestamp),
    ).toBe(false);
    expect(await verificarWebhook(secreto, { ...enc, firma: null }, cuerpo, timestamp)).toBe(false);
  });

  it("rechaza webhooks viejos (repetidos fuera de tiempo)", async () => {
    const enc = { id, timestamp: String(timestamp), firma: firmaOficial };
    expect(await verificarWebhook(secreto, enc, cuerpo, timestamp + 6 * 60)).toBe(false);
  });
});
