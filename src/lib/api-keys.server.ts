// Server-only helpers for Handle API keys. Only SHA-256 hashes are stored.
export async function hashApiKey(key: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function generateApiKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const body = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const key = `hdl_live_${body}`;
  return { key, prefix: key.slice(0, 17) };
}

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
export { json as apiJson };

/** Validates `Authorization: Bearer hdl_live_...`; returns the owning org or an error Response. */
export async function authenticateApiKey(request: Request) {
  const auth = request.headers.get("authorization") ?? "";
  const key = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!/^hdl_live_[a-f0-9]{48}$/.test(key)) {
    return { error: json({ error: "unauthorized", message: "Falta o es inválida la API key (Authorization: Bearer hdl_live_...)." }, 401) };
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("api_keys")
    .select("id, org_id, revoked_at")
    .eq("key_hash", await hashApiKey(key))
    .maybeSingle();
  if (!data || data.revoked_at) {
    return { error: json({ error: "unauthorized", message: "API key no válida o revocada." }, 401) };
  }
  await supabaseAdmin.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return { orgId: data.org_id as string, supabaseAdmin };
}
