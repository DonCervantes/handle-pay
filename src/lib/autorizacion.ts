import { tieneRol, type Rol } from "./roles";

export type PerfilAutorizado = { org_id: string | null; role: Rol; activo: true };

/**
 * Verifica en el servidor que quien llama tenga uno de los roles y un perfil activo.
 * Usar al inicio de cada función de servidor: las guardas de ruta solo ordenan la
 * navegación; la autorización real vive aquí y en RLS.
 */
export async function exigirRol(
  supabase: any,
  userId: string,
  roles: readonly Rol[],
  mensaje = "No tienes permiso para hacer esto.",
): Promise<PerfilAutorizado> {
  const { data } = await supabase.from("profiles").select("org_id, role, activo").eq("id", userId).maybeSingle();
  if (!data?.activo || !tieneRol(data.role, roles)) throw new Error(mensaje);
  return data as PerfilAutorizado;
}
