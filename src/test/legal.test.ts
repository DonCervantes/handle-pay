import { describe, expect, it } from "vitest";
import {
  FORMATO_VERSION,
  VERSION_PRIVACIDAD,
  VERSION_TERMINOS,
  fechaVersion,
  metadatosAceptacion,
} from "@/lib/legal";
import { esRutaPublica } from "@/lib/roles";

describe("aceptación legal (HND-061)", () => {
  it("las versiones tienen el formato que acepta la base", () => {
    expect(VERSION_PRIVACIDAD).toMatch(FORMATO_VERSION);
    expect(VERSION_TERMINOS).toMatch(FORMATO_VERSION);
  });

  it("el registro manda las dos versiones vigentes", () => {
    expect(metadatosAceptacion()).toEqual({
      terminos_version: VERSION_TERMINOS,
      privacidad_version: VERSION_PRIVACIDAD,
    });
  });

  it("muestra la fecha en español sin desfase por zona horaria", () => {
    expect(fechaVersion("2026-11-07")).toBe("7 de noviembre de 2026");
    expect(fechaVersion("2027-01-01")).toBe("1 de enero de 2027");
  });

  it("las páginas legales son públicas", () => {
    expect(esRutaPublica("/privacidad")).toBe(true);
    expect(esRutaPublica("/terminos")).toBe(true);
  });
});
