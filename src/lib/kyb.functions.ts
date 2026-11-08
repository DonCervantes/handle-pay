import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { exigirRol } from "./autorizacion";
import { geocodificar, type Ubicacion } from "./geocoding.server";

/**
 * HND-024 + HND-025: la red aprueba o rechaza un expediente.
 * La decisión es atómica en la base (revisar_expediente). Si se aprueba, después se
 * ubica el negocio con Nominatim; si eso falla, el negocio queda aprobado "sin ubicar".
 */
export const revisarExpediente = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        businessId: z.string().uuid(),
        decision: z.enum(["aprobado", "rechazado"]),
        notas: z.string().trim().max(1000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }): Promise<{ ubicacion: Ubicacion | null }> => {
    await exigirRol(
      context.supabase,
      context.userId,
      ["admin_red"],
      "Solo la red Handle revisa expedientes.",
    );

    // Con la sesión del revisor: la función de la base vuelve a comprobar que es admin de red.
    const { error } = await context.supabase.rpc("revisar_expediente", {
      _business_id: data.businessId,
      _decision: data.decision,
      ...(data.notas ? { _notas: data.notas } : {}),
    });
    if (error) throw new Error(error.message);
    if (data.decision === "rechazado") return { ubicacion: null };

    const db = (await import("@/integrations/supabase/client.server")).supabaseAdmin;
    const { data: negocio } = await db
      .from("businesses")
      .select("direccion, cp")
      .eq("id", data.businessId)
      .single();
    if (!negocio?.direccion || !negocio.cp) return { ubicacion: null };

    const ubicacion = await geocodificar(negocio.direccion, negocio.cp);
    if (ubicacion) {
      const { error: errorUbicacion } = await db
        .from("businesses")
        .update({ lat: Number(ubicacion.lat.toFixed(6)), lng: Number(ubicacion.lng.toFixed(6)) })
        .eq("id", data.businessId);
      if (errorUbicacion) {
        console.error("revisarExpediente/ubicacion", errorUbicacion);
        return { ubicacion: null };
      }
    }
    return { ubicacion };
  });
