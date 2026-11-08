// T14 · Funciones de servidor de la página /demo (entrar sin correo).
//
// En el build de producción `import.meta.env.DEV` es false: Vite elimina las ramas
// `if (import.meta.env.DEV)` y el módulo demo.server.ts (que crea sesiones con la
// service role) no llega al bundle. `bun run verificar:bundle` lo comprueba.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { PERFILES_DEMO } from "./modo-demo";

/** ¿Está disponible la demo en este servidor? (sin datos: solo sí o no). */
export const estadoDemo = createServerFn({ method: "GET" }).handler(async () => {
  if (import.meta.env.DEV) {
    const { modoDemoActivo } = await import("./modo-demo");
    return { activo: modoDemoActivo(process.env, true) };
  }
  return { activo: false };
});

/**
 * Devuelve un token de un solo uso para entrar como el perfil de demo elegido.
 * El navegador lo canjea con `supabase.auth.verifyOtp`. Solo acepta perfiles
 * conocidos (nunca un correo libre) y solo cuentas @demo.handle-prueba.mx.
 */
export const entrarComoDemo = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ perfil: z.enum(PERFILES_DEMO) }).parse(d))
  .handler(async ({ data }) => {
    if (import.meta.env.DEV) {
      const { sesionDemo } = await import("./demo.server");
      return sesionDemo(data.perfil);
    }
    throw new Error("La demo no está disponible.");
  });
