import { describe, expect, it } from "vitest";
// @ts-expect-error: script de Node en JS sin tipos (scripts/demo.mjs).
import { ipLocal, leerBanderas } from "../../scripts/demo.mjs";

const iface = (address: string, internal = false) => ({ address, family: "IPv4", internal });

describe("bun run demo · ipLocal", () => {
  it("elige la IP de la WiFi e ignora loopback, VPN e IPv6", () => {
    expect(
      ipLocal({
        lo0: [iface("127.0.0.1", true)],
        utun3: [iface("10.8.0.2")],
        en0: [{ address: "fe80::1", family: "IPv6", internal: false }, iface("192.168.1.50")],
      }),
    ).toBe("192.168.1.50");
  });

  it("prefiere 192.168.x sobre otras redes privadas", () => {
    expect(ipLocal({ en1: [iface("172.20.0.4")], en0: [iface("10.0.0.7")], en5: [iface("192.168.0.9")] })).toBe(
      "192.168.0.9",
    );
  });

  it("sin red local devuelve null", () => {
    expect(ipLocal({ lo0: [iface("127.0.0.1", true)] })).toBeNull();
  });
});

describe("bun run demo · banderas", () => {
  it("por defecto: red local en el puerto 8080", () => {
    expect(leerBanderas([])).toMatchObject({ tunel: false, puerto: 8080, env: ".env" });
  });

  it("--tunel y --puerto", () => {
    expect(leerBanderas(["--tunel", "--puerto", "8090"])).toMatchObject({ tunel: true, puerto: 8090 });
    expect(leerBanderas(["--puerto=9000"]).puerto).toBe(9000);
  });

  it("rechaza opciones desconocidas y puertos inválidos", () => {
    expect(() => leerBanderas(["--pey"])).toThrow(/desconocida/);
    expect(() => leerBanderas(["--puerto", "abc"])).toThrow(/Puerto/);
  });
});
