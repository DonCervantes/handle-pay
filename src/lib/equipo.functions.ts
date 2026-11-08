import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { exigirRol } from "./autorizacion";
import { ROLES_DE_EQUIPO, ROLES_GERENCIA } from "./roles";

type Ctx = { supabase: any; userId: string };

// Bloqueo "permanente" de Supabase Auth (100 años); "none" lo levanta.
const BLOQUEO_INDEFINIDO = "876000h";

/** Solo el dueño o un administrador activo gestiona el equipo. Devuelve su org. */
async function requireGerencia(ctx: Ctx): Promise<string> {
  const mensaje = "Solo el dueño o un administrador puede gestionar el equipo.";
  const perfil = await exigirRol(ctx.supabase, ctx.userId, ROLES_GERENCIA, mensaje);
  if (!perfil.org_id) throw new Error(mensaje);
  return perfil.org_id;
}

async function admin() {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

/**
 * Da de alta a un cajero o administrador en el negocio de quien llama.
 * No envía correo: la persona entra en /auth con su correo y recibe su enlace.
 * La pertenencia viaja en team_invites (solo service_role la escribe): el trigger
 * de alta la consume al crearse el usuario. No se usa app_metadata porque Supabase
 * Auth lo escribe DESPUÉS del insert y el trigger no lo vería.
 */
export const agregarMiembro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        nombre: z.string().trim().min(1).max(120),
        email: z.string().trim().toLowerCase().email().max(254),
        rol: z.enum(ROLES_DE_EQUIPO),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const orgId = await requireGerencia(context);
    const db = await admin();

    const { data: existente } = await db.from("profiles").select("id").eq("email", data.email).maybeSingle();
    if (existente) {
      throw new Error("Ese correo ya tiene una cuenta en Handle. Por ahora cada cuenta pertenece a un solo negocio.");
    }

    const { error: errorInvitacion } = await db
      .from("team_invites")
      .upsert({ email: data.email, org_id: orgId, role: data.rol, invited_by: context.userId });
    if (errorInvitacion) {
      console.error("agregarMiembro/invitacion", errorInvitacion);
      throw new Error("No pudimos agregar a esta persona. Intenta de nuevo.");
    }

    const { error } = await db.auth.admin.createUser({
      email: data.email,
      email_confirm: true,
      user_metadata: { full_name: data.nombre },
    });
    if (error) {
      // Sin usuario, la invitación no debe quedar viva.
      await db.from("team_invites").delete().eq("email", data.email);
      if (/already|registered|exists/i.test(error.message)) throw new Error("Ese correo ya tiene una cuenta en Handle.");
      console.error("agregarMiembro", error);
      throw new Error("No pudimos agregar a esta persona. Intenta de nuevo.");
    }
    return { ok: true as const };
  });

/**
 * Da de baja (o reactiva) a un miembro del equipo. No borra la cuenta: conserva
 * el historial (p. ej. quién hizo cada cobro). La baja corta el acceso al instante
 * vía RLS (perfil inactivo) y bloquea nuevos inicios de sesión en Supabase Auth.
 */
export const cambiarEstadoMiembro = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), activo: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const orgId = await requireGerencia(context);
    if (data.userId === context.userId) throw new Error("No puedes cambiar tu propio acceso.");

    const db = await admin();
    const { data: miembro } = await db.from("profiles").select("org_id, role").eq("id", data.userId).maybeSingle();
    if (!miembro || miembro.org_id !== orgId) throw new Error("Esa persona no es parte de tu equipo.");
    if (miembro.role === "owner") throw new Error("No se puede dar de baja al dueño del negocio.");

    const { error: errorPerfil } = await db.from("profiles").update({ activo: data.activo }).eq("id", data.userId);
    if (errorPerfil) {
      console.error("cambiarEstadoMiembro/perfil", errorPerfil);
      throw new Error("No pudimos actualizar el acceso. Intenta de nuevo.");
    }
    const { error: errorAuth } = await db.auth.admin.updateUserById(data.userId, {
      ban_duration: data.activo ? "none" : BLOQUEO_INDEFINIDO,
    });
    if (errorAuth) {
      // El perfil ya quedó actualizado (RLS corta el acceso); solo falló el bloqueo de inicio de sesión.
      console.error("cambiarEstadoMiembro/auth", errorAuth);
      throw new Error("El acceso se actualizó, pero no pudimos bloquear el inicio de sesión. Intenta de nuevo.");
    }
    return { ok: true as const };
  });
