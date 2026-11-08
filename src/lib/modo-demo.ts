// T14 · Modo demo: entrar sin correo a las cuentas de demostración.
//
// Solo se enciende si se cumplen TODAS:
//   1. DEMO_MODE=true en el entorno del servidor (apagado por defecto);
//   2. PAYMENTS_PROVIDER es mock (la demo nunca mueve dinero real);
//   3. la app corre en desarrollo (`vite dev`). En el build de producción
//      `import.meta.env.DEV` es false y el código que crea sesiones ni siquiera
//      entra al bundle (lo revisa `bun run verificar:bundle`).
// Además solo crea sesiones para correos @demo.handle-prueba.mx.

import { cuentaDemo, DOMINIO_DEMO, type ClaveCuentaDemo } from "./demo";

type Entorno = Record<string, string | undefined>;

/** Versión estricta (un solo "@" y dominio exacto) para decidir a quién se le abre sesión. */
export function esCorreoDemo(email: string | null | undefined): boolean {
  if (!email) return false;
  const limpio = email.trim().toLowerCase();
  const [usuario, dominio, ...resto] = limpio.split("@");
  return !!usuario && dominio === DOMINIO_DEMO && resto.length === 0;
}

/** ¿Está encendido el modo demo? `dev` es `import.meta.env.DEV` (inyectable para las pruebas). */
export function modoDemoActivo(env: Entorno, dev: boolean): boolean {
  if (!dev) return false;
  if ((env["DEMO_MODE"] ?? "").trim().toLowerCase() !== "true") return false;
  return (env["PAYMENTS_PROVIDER"] ?? "mock").trim().toLowerCase() === "mock";
}

/** Perfiles con botón en /demo (las cuentas de CUENTAS_DEMO en src/lib/demo.ts). */
export const PERFILES_DEMO = ["duena", "cajero", "cliente", "red"] as const satisfies readonly ClaveCuentaDemo[];
export type PerfilDemo = (typeof PERFILES_DEMO)[number];

export function correoDePerfil(perfil: PerfilDemo): string {
  return cuentaDemo(perfil).email;
}
