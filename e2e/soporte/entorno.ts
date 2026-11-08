// Variables que necesita la suite E2E. Se leen del entorno (carga el .env antes:
// `set -a; source .env; set +a`). Nunca se imprimen.
export const PUERTO = Number(process.env["E2E_PORT"] ?? 8081);
export const BASE_URL = process.env["E2E_BASE_URL"] ?? `http://localhost:${PUERTO}`;

/** Dominio de los correos de prueba: todo lo que crea la suite queda marcado con él. */
export const DOMINIO_E2E = "e2e.handle-prueba.mx";

function requerida(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) {
    throw new Error(
      `Falta ${nombre}. Carga el .env antes de correr la suite: set -a; source .env; set +a`,
    );
  }
  return valor;
}

/**
 * La suite cobra y simula pagos: SOLO corre con el simulador. Con PAYMENTS_PROVIDER=pey
 * cada cobro sería dinero real, así que se detiene antes de levantar nada.
 */
export function exigirModoMock() {
  const proveedor = (process.env["PAYMENTS_PROVIDER"] ?? "mock").toLowerCase();
  if (proveedor !== "mock") {
    throw new Error(
      `La suite E2E solo corre con PAYMENTS_PROVIDER=mock (está en "${proveedor}"). No se levanta nada.`,
    );
  }
}

export const entorno = {
  get supabaseUrl() {
    return requerida("SUPABASE_URL").replace(/\/+$/, "");
  },
  get publishableKey() {
    return requerida("SUPABASE_PUBLISHABLE_KEY");
  },
  get serviceRoleKey() {
    return requerida("SUPABASE_SERVICE_ROLE_KEY");
  },
};
