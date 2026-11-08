import { createFileRoute } from "@tanstack/react-router";
import { apiJson, authenticateApiKey } from "@/lib/api-keys.server";

export const Route = createFileRoute("/api/v1/transactions")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authenticateApiKey(request);
        if ("error" in auth) return auth.error;
        const url = new URL(request.url);
        const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 200);
        const type = url.searchParams.get("type");
        let q = auth.supabaseAdmin
          .from("transactions")
          .select("id, type, amount, currency, category, description, occurred_at, client_id, supplier_id, payment_id")
          .eq("org_id", auth.orgId)
          .order("occurred_at", { ascending: false })
          .limit(limit);
        if (type === "income" || type === "expense") q = q.eq("type", type);
        const { data, error } = await q;
        if (error) return apiJson({ error: "internal_error" }, 500);
        return apiJson({ object: "list", count: data.length, data });
      },
    },
  },
});
