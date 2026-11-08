import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { idUnico } from "@/lib/id-unico";

const uuid = z.string().uuid();

describe("idUnico", () => {
  const original = Object.getOwnPropertyDescriptor(crypto, "randomUUID");
  afterEach(() => {
    if (original) Object.defineProperty(crypto, "randomUUID", original);
    else delete (crypto as { randomUUID?: unknown }).randomUUID;
  });

  it("devuelve un UUID válido", () => {
    expect(uuid.safeParse(idUnico()).success).toBe(true);
  });

  it("funciona sin crypto.randomUUID (http por la IP de la red local)", () => {
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
    const ids = new Set(Array.from({ length: 50 }, () => idUnico()));
    expect(ids.size).toBe(50);
    for (const id of ids) {
      expect(uuid.safeParse(id).success, id).toBe(true);
      expect(id[14]).toBe("4");
    }
  });
});
