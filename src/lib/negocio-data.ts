import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import type { DatosExpediente } from "./kyb";

export type Negocio = Tables<"businesses">;
export type DocumentoKyb = Pick<
  Tables<"kyb_documents">,
  "id" | "tipo" | "storage_path" | "estado" | "updated_at"
>;

/** El negocio de la organización del usuario (RLS solo deja ver el propio). */
export const miNegocioQuery = queryOptions({
  queryKey: ["mi-negocio"],
  queryFn: async () => {
    const { data, error } = await supabase.from("businesses").select("*").maybeSingle();
    if (error) throw error;
    return data;
  },
});

export const documentosQuery = (businessId: string) =>
  queryOptions({
    queryKey: ["kyb-documentos", businessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kyb_documents")
        .select("id, tipo, storage_path, estado, updated_at")
        .eq("business_id", businessId);
      if (error) throw error;
      return data as DocumentoKyb[];
    },
  });

export const revisionesQuery = (businessId: string) =>
  queryOptions({
    queryKey: ["kyb-revisiones", businessId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kyb_reviews")
        .select("id, decision, notas, created_at")
        .eq("business_id", businessId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

/** Cuenta de cobro CoDi del negocio (RLS: solo la gerencia la ve). */
export const cuentaCobroQuery = queryOptions({
  queryKey: ["cuenta-cobro"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("pey_accounts")
      .select("id, estado, clabe_ultimos4, titular, error_mensaje, updated_at")
      .maybeSingle();
    if (error) throw error;
    return data;
  },
});

/** Datos del expediente tal como están guardados (para saber qué falta). */
export function datosDeNegocio(n: Negocio): DatosExpediente {
  return {
    nombre_comercial: n.nombre_comercial,
    tipo_persona: n.tipo_persona,
    razon_social: n.razon_social ?? "",
    rfc: n.rfc ?? "",
    curp: n.curp ?? "",
    categoria: n.categoria,
    telefono: n.telefono ?? "",
    direccion: n.direccion ?? "",
    cp: n.cp ?? "",
  };
}

/**
 * Abre un documento KYB del bucket privado con un enlace que vence en 60 segundos.
 * La pestaña se abre antes de pedir el enlace para que el navegador no la bloquee.
 */
export async function abrirDocumento(path: string) {
  const pestana = window.open("", "_blank");
  const { data, error } = await supabase.storage.from("kyb").createSignedUrl(path, 60);
  if (error || !data) {
    pestana?.close();
    throw new Error("No pudimos abrir el documento. Intenta de nuevo.");
  }
  if (pestana) pestana.location.href = data.signedUrl;
  else window.location.assign(data.signedUrl);
}
