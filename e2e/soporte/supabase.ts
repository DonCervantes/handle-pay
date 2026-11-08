// Ayudantes de la suite E2E contra la base compartida (service role, solo en Node).
// Todo lo que se crea aquí usa correos @e2e.handle-prueba.mx y nombres "E2E …";
// nunca se toca ni se borra nada ajeno.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";
import type { Database } from "../../src/integrations/supabase/types";
import { BASE_URL, DOMINIO_E2E, entorno } from "./entorno";

type Admin = SupabaseClient<Database>;

function esLlaveNueva(llave: string) {
  return llave.startsWith("sb_publishable_") || llave.startsWith("sb_secret_");
}

let _admin: Admin | undefined;

/** Cliente con service role (ignora RLS). Igual que client.server.ts. */
export function admin(): Admin {
  if (_admin) return _admin;
  const llave = entorno.serviceRoleKey;
  _admin = createClient<Database>(entorno.supabaseUrl, llave, {
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        // Las llaves nuevas son opacas, no JWT: no van como Bearer.
        if (esLlaveNueva(llave) && headers.get("Authorization") === `Bearer ${llave}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", llave);
        return fetch(input, { ...init, headers });
      },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}

/** Correo de prueba único por corrida (o fijo si se pasa `fijo`). */
export function correoE2E(prefijo: string, fijo = false) {
  const sufijo = fijo ? "" : `-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  return `${prefijo}${sufijo}@${DOMINIO_E2E}`;
}

export type DatosRegistro =
  | { full_name: string; tipo_cuenta: "negocio"; org_name: string }
  | { full_name: string; tipo_cuenta: "cliente" };

function exigirCorreoE2E(email: string) {
  if (!email.endsWith(`@${DOMINIO_E2E}`)) {
    throw new Error(`La suite E2E solo usa correos @${DOMINIO_E2E} (recibió ${email}).`);
  }
}

/**
 * Entra con magic link sin correo: la API admin `generate_link` crea el enlace (y el
 * usuario, si no existe, con los mismos metadatos que manda /auth al registrarse).
 * Se canjea el token en /auth/v1/verify y se abre /auth con el fragmento de sesión,
 * igual que si el usuario hubiera hecho clic en el enlace del correo. Así no depende
 * de que localhost esté en las Redirect URLs de Supabase.
 */
export async function entrarConMagicLink(page: Page, email: string, datos?: DatosRegistro) {
  exigirCorreoE2E(email);
  const { data, error } = await admin().auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: `${BASE_URL}/auth`, ...(datos ? { data: datos } : {}) },
  });
  if (error || !data.properties?.hashed_token) {
    throw new Error(`generate_link falló: ${error?.message ?? "sin token"}`);
  }
  const verificar = new URL(`${entorno.supabaseUrl}/auth/v1/verify`);
  verificar.searchParams.set("token", data.properties.hashed_token);
  verificar.searchParams.set("type", data.properties.verification_type ?? "magiclink");
  verificar.searchParams.set("redirect_to", `${BASE_URL}/auth`);
  const r = await fetch(verificar, {
    redirect: "manual",
    headers: { apikey: entorno.publishableKey },
  });
  const destino = r.headers.get("location");
  const fragmento = destino ? new URL(destino).hash : "";
  if (!fragmento.includes("access_token=")) {
    // Sin tokens en el mensaje: solo el error que reporta Supabase, si lo hay.
    const motivo = destino ? new URLSearchParams(new URL(destino).hash.slice(1) || new URL(destino).search).get("error_description") : null;
    throw new Error(`El enlace no devolvió sesión (HTTP ${r.status}${motivo ? `: ${motivo}` : ""}).`);
  }
  await page.goto(`${BASE_URL}/auth${fragmento}`);
  return { userId: data.user.id };
}

/** Id de usuario de un correo de prueba ya registrado, o null. */
export async function usuarioPorCorreo(email: string) {
  exigirCorreoE2E(email);
  const { data } = await admin().from("profiles").select("id, org_id, role").eq("email", email).maybeSingle();
  return data;
}

/**
 * Deja el negocio de la org listo para cobrar en modo mock, como si la red hubiera
 * aprobado su KYB y el simulador hubiera activado su cuenta CoDi. Con service role
 * (las guardas de la base solo frenan a usuarios). Coordenadas en CDMX para el mapa.
 */
export async function prepararNegocioAprobado(
  orgId: string,
  nombre: string,
  opciones: { categoria?: Database["public"]["Enums"]["categoria_negocio"]; activo?: boolean } = {},
) {
  if (!nombre.startsWith("E2E")) throw new Error("Los negocios de prueba se llaman 'E2E …'.");
  const db = admin();
  const fila = {
    org_id: orgId,
    nombre_comercial: nombre,
    razon_social: `${nombre} (prueba automatizada)`,
    tipo_persona: "fisica" as const,
    rfc: "XAXX010101000",
    categoria: opciones.categoria ?? ("taqueria" as const),
    direccion: "Calle de Prueba 123, Col. Centro, CDMX",
    cp: "06000",
    lat: 19.432608,
    lng: -99.133209,
    estado_kyb: "aprobado" as const,
    activo: opciones.activo ?? true,
  };
  const { data: existente } = await db.from("businesses").select("id").eq("org_id", orgId).maybeSingle();
  const { data: negocio, error } = existente
    ? await db.from("businesses").update(fila).eq("id", existente.id).select("id").single()
    : await db.from("businesses").insert(fila).select("id").single();
  if (error || !negocio) throw new Error(`No se pudo preparar el negocio: ${error?.message}`);

  const { data: cuenta } = await db
    .from("pey_accounts")
    .select("id")
    .eq("business_id", negocio.id)
    .maybeSingle();
  if (!cuenta) {
    const { error: errorCuenta } = await db.from("pey_accounts").insert({
      org_id: orgId,
      business_id: negocio.id,
      pey_bank_account_id: `sim_cuenta_e2e_${negocio.id.slice(0, 8)}`,
      estado: "activa",
      clabe_ultimos4: "0000",
      titular: "E2E Titular",
    });
    if (errorCuenta) throw new Error(`No se pudo preparar la cuenta CoDi: ${errorCuenta.message}`);
  }
  return negocio.id;
}

/** Quita el negocio de prueba del mapa público al terminar (no se borra: el ledger es inmutable). */
export async function retirarNegocio(businessId: string) {
  await admin().from("businesses").update({ activo: false, recomendado: false }).eq("id", businessId);
}

/** Saldo de puntos de un cliente en un negocio (0 si no tiene). */
export async function saldoDe(email: string, businessId: string) {
  const db = admin();
  const { data: cliente } = await db.from("customers").select("id").eq("email", email).maybeSingle();
  if (!cliente) return 0;
  const { data } = await db
    .from("customer_point_balances")
    .select("saldo")
    .eq("customer_id", cliente.id)
    .eq("business_id", businessId)
    .maybeSingle();
  return Number(data?.saldo ?? 0);
}

/** ¿Existe ya negocios_publicos() en la base? (migración del mapa aplicada) */
export async function mapaPublicoDisponible() {
  const r = await fetch(`${entorno.supabaseUrl}/rest/v1/rpc/negocios_publicos`, {
    method: "POST",
    headers: { apikey: entorno.publishableKey, "Content-Type": "application/json" },
    body: "{}",
  });
  return r.ok;
}
