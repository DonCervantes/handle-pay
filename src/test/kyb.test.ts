import { describe, expect, it } from "vitest";
import {
  erroresExpediente,
  faltantesParaEnviar,
  fechaClaveValida,
  limpiarExpediente,
  validarCurp,
  validarRfc,
  type DatosExpediente,
} from "@/lib/kyb";

const completo: DatosExpediente = {
  nombre_comercial: "Abarrotes Doña Mari",
  tipo_persona: "fisica",
  razon_social: "María López Martínez",
  rfc: "LOMM800101AB1",
  curp: "LOMM800101MDFPRR01",
  categoria: "abarrotes",
  telefono: "5512345678",
  direccion: "Calle 5 de Mayo 12, Centro",
  cp: "06000",
};

describe("fechas dentro de RFC y CURP", () => {
  it("acepta fechas posibles", () => {
    expect(fechaClaveValida("800101")).toBe(true);
    expect(fechaClaveValida("000229")).toBe(true);
  });
  it("rechaza meses o días que no existen", () => {
    expect(fechaClaveValida("801301")).toBe(false);
    expect(fechaClaveValida("800230")).toBe(false);
    expect(fechaClaveValida("800431")).toBe(false);
    expect(fechaClaveValida("800100")).toBe(false);
  });
});

describe("validarRfc", () => {
  it("acepta RFC de persona física y moral", () => {
    expect(validarRfc("LOMM800101AB1", "fisica")).toBeNull();
    expect(validarRfc("AKY800101AB1", "moral")).toBeNull();
  });
  it("tolera minúsculas y espacios al capturar", () => {
    expect(validarRfc(" lomm 800101 ab1 ", "fisica")).toBeNull();
  });
  it("exige la longitud del tipo de persona", () => {
    expect(validarRfc("AKY800101AB1", "fisica")).toMatch(/13 caracteres/);
    expect(validarRfc("LOMM800101AB1", "moral")).toMatch(/12 caracteres/);
  });
  it("rechaza formato o fecha inválidos", () => {
    expect(validarRfc("LOM1800101AB1", "fisica")).toMatch(/formato/);
    expect(validarRfc("LOMM801301AB1", "fisica")).toMatch(/fecha/);
  });
});

describe("validarCurp", () => {
  it("acepta una CURP válida", () => {
    expect(validarCurp("LOMM800101MDFPRR01")).toBeNull();
  });
  it("rechaza longitud, formato o fecha incorrectos", () => {
    expect(validarCurp("LOMM800101")).toMatch(/18 caracteres/);
    expect(validarCurp("LOMM800101ZDFPRR01")).toMatch(/formato/);
    expect(validarCurp("LOMM801301MDFPRR01")).toMatch(/fecha/);
  });
});

describe("expediente", () => {
  it("un expediente completo no tiene errores", () => {
    expect(erroresExpediente(completo, { completo: true })).toEqual({});
  });

  it("el borrador solo exige el nombre y revisa el formato de lo escrito", () => {
    const borrador = {
      ...completo,
      razon_social: "",
      rfc: "",
      curp: "",
      telefono: "",
      direccion: "",
      cp: "",
    };
    expect(erroresExpediente(borrador, { completo: false })).toEqual({});
    expect(
      erroresExpediente({ ...borrador, nombre_comercial: "" }, { completo: false }),
    ).toHaveProperty("nombre_comercial");
    expect(erroresExpediente({ ...borrador, cp: "123" }, { completo: false })).toHaveProperty("cp");
  });

  it("para enviar exige todo", () => {
    const borrador = { ...completo, rfc: "", telefono: "" };
    const e = erroresExpediente(borrador, { completo: true });
    expect(Object.keys(e).sort()).toEqual(["rfc", "telefono"]);
  });

  it("la persona moral no necesita CURP y se descarta si la escriben", () => {
    const moral: DatosExpediente = {
      ...completo,
      tipo_persona: "moral",
      rfc: "AKY800101AB1",
      curp: "LOMM800101MDFPRR01",
    };
    expect(erroresExpediente(moral, { completo: true })).toEqual({});
    expect(limpiarExpediente(moral).curp).toBe("");
  });

  it("limpia teléfono y claves", () => {
    const d = limpiarExpediente({ ...completo, telefono: "55 1234-5678", rfc: "lomm800101ab1" });
    expect(d.telefono).toBe("5512345678");
    expect(d.rfc).toBe("LOMM800101AB1");
  });

  it("lista lo que falta para enviar", () => {
    expect(
      faltantesParaEnviar(completo, [
        "ine",
        "constancia_fiscal",
        "comprobante_domicilio",
        "titularidad_cuenta",
      ]),
    ).toEqual([]);
    const faltan = faltantesParaEnviar({ ...completo, cp: "" }, ["ine"]);
    expect(faltan).toContain("Revisar o completar: Código postal");
    expect(faltan.filter((f) => f.startsWith("Subir:"))).toHaveLength(3);
    expect(faltantesParaEnviar(null, [])[0]).toBe("Guardar los datos del negocio");
  });
});
