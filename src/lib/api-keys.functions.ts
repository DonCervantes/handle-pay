import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateApiKey, hashApiKey } from "./api-keys.server";
import { exigirRol } from "./autorizacion";
import { ROLES_GERENCIA } from "./roles";

async function requireAdmin(ctx: { supabase: any; userId: string }) {
  await exigirRol(ctx.supabase, ctx.userId, ROLES_GERENCIA, "Solo propietarios y administradores pueden gestionar API keys.");
}

export const createApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ name: z.string().trim().min(1).max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { key, prefix } = generateApiKey();
    const { error } = await context.supabase
      .from("api_keys")
      .insert({ name: data.name, key_prefix: prefix, key_hash: await hashApiKey(key) } as never);
    if (error) throw new Error("No pudimos crear la API key.");
    return { key, prefix };
  });

export const revokeApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const { error } = await context.supabase
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error("No pudimos revocar la API key.");
    return { ok: true };
  });
