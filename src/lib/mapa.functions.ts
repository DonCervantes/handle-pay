import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { exigirRol } from "./autorizacion";

/**
 * HND-053: la red marca o desmarca un negocio como recomendado en el mapa.
 * Tres candados: exigirRol aquí, RLS (businesses_update deja a admin_red) y el
 * trigger guard_business_write, que impide que un negocio se recomiende a sí mismo.
 * Además la base exige expediente aprobado (businesses_recomendado_requiere_aprobacion).
 */
export const marcarRecomendado = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ businessId: z.string().uuid(), recomendado: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<{ recomendado: boolean }> => {
    await exigirRol(
      context.supabase,
      context.userId,
      ["admin_red"],
      "Solo la red Handle puede recomendar negocios.",
    );

    // Con la sesión de quien llama (no el admin client): RLS y el trigger vuelven a validar.
    const { data: negocio, error: errorLectura } = await context.supabase
      .from("businesses")
      .select("estado_kyb")
      .eq("id", data.businessId)
      .maybeSingle();
    if (errorLectura) throw new Error(errorLectura.message);
    if (!negocio) throw new Error("No encontramos este negocio.");
    if (data.recomendado && negocio.estado_kyb !== "aprobado") {
      throw new Error("Solo se puede recomendar un negocio con el expediente aprobado.");
    }

    const { data: actualizado, error } = await context.supabase
      .from("businesses")
      .update({ recomendado: data.recomendado })
      .eq("id", data.businessId)
      .select("recomendado")
      .single();
    if (error) throw new Error(error.message);
    return { recomendado: actualizado.recomendado };
  });
