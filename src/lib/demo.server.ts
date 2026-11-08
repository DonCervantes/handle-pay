// T14 · Crea la sesión de una cuenta de demo con `generate_link` (service role).
// Solo se importa desde ramas `if (import.meta.env.DEV)`: nunca entra al build de producción.
import { correoDePerfil, esCorreoDemo, modoDemoActivo, type PerfilDemo } from "./modo-demo";

// Marca que `verificar:bundle` busca en el build de producción: si aparece, este
// módulo se coló al bundle y el deploy se detiene.
export const MARCA_SESION_DEMO = "handle-demo-sesion-v1";

export async function sesionDemo(perfil: PerfilDemo) {
  if (!modoDemoActivo(process.env, import.meta.env.DEV)) {
    throw new Error("La demo no está disponible.");
  }
  const email = correoDePerfil(perfil);
  if (!esCorreoDemo(email)) throw new Error("La demo no está disponible.");

  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  // No se crean cuentas aquí: deben existir (las crea `bun run demo:datos`).
  const { data: perfilDb } = await db
    .from("profiles")
    .select("id, role, activo")
    .eq("email", email)
    .maybeSingle();
  if (!perfilDb) {
    throw new Error("Faltan los datos de demo. Corre primero: bun run demo:datos");
  }
  if (!perfilDb.activo) throw new Error("Esta cuenta de demo está dada de baja.");

  const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email });
  const token = data?.properties?.hashed_token;
  if (error || !token) {
    console.error(`[${MARCA_SESION_DEMO}] generate_link falló`, error?.message);
    throw new Error("No se pudo abrir la sesión de demo. Intenta de nuevo.");
  }
  return { tokenHash: token, rol: perfilDb.role };
}
