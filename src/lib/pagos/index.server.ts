import { ProveedorPey } from "./pey.server";
import { ProveedorSimulado } from "./simulador.server";
import type { ProveedorPagos } from "./proveedor";

/**
 * Proveedor según PAYMENTS_PROVIDER: "pey" (real) o "mock" (simulador, por defecto).
 * Con "pey" se exige PEY_API_KEY: nunca se cae al simulador sin avisar.
 */
export function obtenerProveedor(): ProveedorPagos {
  const elegido = (process.env["PAYMENTS_PROVIDER"] ?? "mock").toLowerCase();
  if (elegido === "pey") {
    const apiKey = process.env["PEY_API_KEY"];
    if (!apiKey) throw new Error("PAYMENTS_PROVIDER=pey requiere PEY_API_KEY.");
    return new ProveedorPey(apiKey, process.env["PEY_API_URL"] ?? "https://api.pey.mx");
  }
  return new ProveedorSimulado();
}

export function modoSimulador(): boolean {
  return (process.env["PAYMENTS_PROVIDER"] ?? "mock").toLowerCase() !== "pey";
}
