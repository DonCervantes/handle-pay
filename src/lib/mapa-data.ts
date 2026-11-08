import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { aNegocioPublico, aNegociosPublicos } from "./mapa";

// Lecturas del mapa público. Funcionan sin sesión (rol anon): solo pasan por
// negocios_publicos(), que expone datos no sensibles de negocios aprobados.
// Nunca leer `businesses` directamente desde las páginas públicas.

export const negociosPublicosQuery = queryOptions({
  queryKey: ["negocios-publicos"],
  queryFn: async () => {
    const { data, error } = await supabase.rpc("negocios_publicos");
    if (error) throw error;
    return aNegociosPublicos(data);
  },
  staleTime: 60_000,
});

export const negocioPublicoQuery = (id: string) =>
  queryOptions({
    queryKey: ["negocio-publico", id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("negocios_publicos").eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? aNegocioPublico(data) : null;
    },
    staleTime: 60_000,
  });
