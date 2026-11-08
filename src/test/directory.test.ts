import { describe, expect, it } from "vitest";
import { clientIncome, employeeStatuses, matchesDirectory } from "@/lib/directory";
import { formatMXN } from "@/lib/format";

describe("Reglas de directorios y estado de cuenta", () => {
  it("incluye solo ingresos del cliente seleccionado", () => {
    const rows = [{ id: 1, client_id: "cliente-a", type: "income" }, { id: 2, client_id: "cliente-a", type: "expense" }, { id: 3, client_id: "cliente-b", type: "income" }];
    expect(clientIncome(rows, "cliente-a").map((r) => r.id)).toEqual([1]);
  });
  it("busca clientes por nombre o email y respeta su estado", () => {
    const row = { name: "Comercial México", secondary: "compras@comercial.mx", status: "activo" };
    expect(matchesDirectory(row, "COMERCIAL", "activo")).toBe(true);
    expect(matchesDirectory(row, "compras@", "activo")).toBe(true);
    expect(matchesDirectory(row, "compras@", "inactivo")).toBe(false);
  });
  it("busca colaboradores por nombre o puesto", () => {
    const row = { name: "Ana López", secondary: "Contadora", status: "inactivo" };
    expect(matchesDirectory(row, "ana", "inactivo")).toBe(true);
    expect(matchesDirectory(row, "CONTADORA", "inactivo")).toBe(true);
    expect(matchesDirectory(row, "Ventas", "inactivo")).toBe(false);
  });
  it("ofrece activo e inactivo como estados de colaboradores", () => {
    expect(employeeStatuses).toEqual(["activo", "inactivo"]);
  });
  it("formatea MXN con separador de miles y dos decimales", () => {
    expect(formatMXN(12345.67)).toBe("$12,345.67");
    expect(formatMXN(12345)).toBe("$12,345.00");
  });
});