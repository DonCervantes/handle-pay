import { describe, expect, it } from "vitest";
import { errorCoordenada, pinCambio, redondearCoordenada } from "@/lib/pin";

describe("mover el pin a mano (HND-115)", () => {
  it("acepta coordenadas dentro de México", () => {
    expect(errorCoordenada({ lat: 19.432608, lng: -99.133209 })).toBeNull(); // CDMX
    expect(errorCoordenada({ lat: 32.5149, lng: -117.0382 })).toBeNull(); // Tijuana
    expect(errorCoordenada({ lat: 21.1619, lng: -86.8515 })).toBeNull(); // Cancún
  });

  it("rechaza fuera de México, invertidas o no numéricas", () => {
    expect(errorCoordenada({ lat: -99.13, lng: 19.43 })).toMatch(/México/);
    expect(errorCoordenada({ lat: 40.4168, lng: -3.7038 })).toMatch(/México/); // Madrid
    expect(errorCoordenada({ lat: 0, lng: 0 })).toMatch(/México/);
    expect(errorCoordenada({ lat: Number.NaN, lng: -99 })).toMatch(/inválidas/);
    expect(errorCoordenada({ lat: 19, lng: Number.POSITIVE_INFINITY })).toMatch(/inválidas/);
  });

  it("redondea a 6 decimales como numeric(9, 6)", () => {
    expect(redondearCoordenada({ lat: 19.4326081234, lng: -99.1332094999 })).toEqual({
      lat: 19.432608,
      lng: -99.133209,
    });
  });

  it("detecta si el pin se movió", () => {
    expect(pinCambio(null, { lat: 19.4, lng: -99.1 })).toBe(true);
    expect(pinCambio({ lat: 19.432608, lng: -99.133209 }, { lat: 19.4326081, lng: -99.1332089 })).toBe(false);
    expect(pinCambio({ lat: 19.432608, lng: -99.133209 }, { lat: 19.4327, lng: -99.133209 })).toBe(true);
  });
});
