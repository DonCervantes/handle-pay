import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { groqChat, runAgent, MissingKeyError, getGroqModel } from "./ai.server";
import { N8N_EVENTS } from "./n8n.server";

import { CATEGORIES } from "./categories";
import { exigirRol } from "./autorizacion";
import { ROLES_FINANZAS, ROLES_OFICINA } from "./roles";

type Result<T> = { ok: true; data: T } | { ok: false; error: string; missingKey?: boolean };
const toError = (e: unknown) => ({
  ok: false as const,
  error: e instanceof Error ? e.message : "Error inesperado",
  missingKey: e instanceof MissingKeyError,
});

async function buildFinanceContext(supabase: any) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const [{ data: tx }, { data: accounts }, { count: clients }, { count: suppliers }, { data: org }, { data: payments }] = await Promise.all([
    supabase.from("transactions").select("type, amount, category, occurred_at").gte("occurred_at", prevStart),
    supabase.from("accounts").select("name, type, balance"),
    supabase.from("clients").select("id", { count: "exact", head: true }),
    supabase.from("suppliers").select("id", { count: "exact", head: true }),
    supabase.from("organizations").select("name, currency_default").maybeSingle(),
    supabase.from("payments").select("status, amount_fiat"),
  ]);
  const sum = (rows: any[], type: string) => rows.filter((t) => t.type === type).reduce((a, t) => a + Number(t.amount), 0);
  const cur = (tx ?? []).filter((t: any) => t.occurred_at >= monthStart);
  const prev = (tx ?? []).filter((t: any) => t.occurred_at < monthStart);
  const byCat: Record<string, number> = {};
  for (const t of cur.filter((t: any) => t.type === "expense")) byCat[t.category] = (byCat[t.category] ?? 0) + Number(t.amount);
  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    empresa: org?.name,
    moneda: org?.currency_default ?? "MXN",
    fecha_hoy: now.toISOString().slice(0, 10),
    mes_actual: { ingresos: r(sum(cur, "income")), egresos: r(sum(cur, "expense")), flujo_neto: r(sum(cur, "income") - sum(cur, "expense")), movimientos: cur.length },
    mes_anterior: { ingresos: r(sum(prev, "income")), egresos: r(sum(prev, "expense")) },
    top_categorias_egreso_mes: Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([categoria, monto]) => ({ categoria, monto: r(monto) })),
    cuentas: (accounts ?? []).map((a: any) => ({ nombre: a.name, tipo: a.type, saldo: Number(a.balance) })),
    saldo_total: r((accounts ?? []).reduce((a: number, x: any) => a + Number(x.balance), 0)),
    clientes: clients ?? 0,
    proveedores: suppliers ?? 0,
    pagos_proveedores_pendientes: (payments ?? []).filter((p: any) => p.status === "draft" || p.status === "submitted").length,
  };
}

export const askFinanceAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      question: z.string().trim().min(2).max(1000),
      history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(10).default([]),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<Result<{ answer: string }>> => {
    try {
      // Antes de gastar una llamada a la IA: solo personal de oficina.
      await exigirRol(context.supabase, context.userId, ROLES_OFICINA, "El asistente financiero es solo para el personal de oficina.");
      const ctx = await buildFinanceContext(context.supabase);
      const answer = await runAgent(context.supabase, "finance_assistant", { question: data.question }, async () => {
        const r = await groqChat([
          {
            role: "system",
            content:
              "Eres el asistente financiero de Handle, un ERP para PyMEs en México. Responde en español de México, claro y breve (máx. 6 oraciones o una lista corta). " +
              "Usa SOLO los datos del contexto JSON; si algo no está, dilo. Formatea montos como $12,345.67 MXN. No inventes cifras.\n\nCONTEXTO:\n" +
              JSON.stringify(ctx),
          },
          ...data.history,
          { role: "user", content: data.question },
        ]);
        return { output: { answer: r.content }, tokens: r.tokens };
      });
      return { ok: true, data: answer };
    } catch (e) {
      return toError(e);
    }
  });

export const suggestCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ onlyGeneric: z.boolean().default(true) }).parse(d))
  .handler(async ({ data, context }): Promise<Result<{ suggestions: { id: string; description: string | null; amount: number; type: string; current: string; suggested: string }[] }>> => {
    try {
      // Las sugerencias terminan modificando movimientos: solo quien maneja finanzas.
      await exigirRol(context.supabase, context.userId, ROLES_FINANZAS, "Solo finanzas puede reclasificar movimientos.");
      let q = context.supabase.from("transactions").select("id, description, amount, type, category").order("occurred_at", { ascending: false }).limit(40);
      if (data.onlyGeneric) q = q.or("category.is.null,category.eq.General,category.eq.,category.eq.Otros");
      const { data: rows } = await q;
      if (!rows?.length) return { ok: true, data: { suggestions: [] } };
      const out = await runAgent(context.supabase, "auto_categorize", { count: rows.length }, async () => {
        const r = await groqChat(
          [
            {
              role: "system",
              content:
                `Clasificas transacciones de una PyME mexicana. Categorías permitidas: ${CATEGORIES.join(", ")}. ` +
                'Responde SOLO JSON: {"items":[{"id":"...","category":"..."}]} con una entrada por transacción.',
            },
            { role: "user", content: JSON.stringify(rows.map((t: any) => ({ id: t.id, descripcion: t.description, monto: Number(t.amount), tipo: t.type === "income" ? "ingreso" : "egreso" }))) },
          ],
          { json: true, temperature: 0 },
        );
        let items: { id: string; category: string }[] = [];
        try {
          items = JSON.parse(r.content).items ?? [];
        } catch {
          throw new Error("La IA devolvió una respuesta inválida. Intenta de nuevo.");
        }
        return { output: { items }, tokens: r.tokens };
      });
      const map = new Map(out.items.map((i) => [i.id, i.category]));
      return {
        ok: true,
        data: {
          suggestions: rows.map((t: any) => {
            const s = map.get(t.id);
            return { id: t.id, description: t.description, amount: Number(t.amount), type: t.type, current: t.category, suggested: s && CATEGORIES.includes(s) ? s : "General" };
          }),
        },
      };
    } catch (e) {
      return toError(e);
    }
  });

export const getIntegrationsStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => ({
    groq: { configured: !!process.env["GROQ_API_KEY"], model: getGroqModel() },
    n8n: { configured: !!process.env["N8N_WEBHOOK_URL"], events: [...N8N_EVENTS] },
  }));
