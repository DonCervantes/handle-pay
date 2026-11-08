import { createFileRoute } from "@tanstack/react-router";
import { apiJson, authenticateApiKey } from "@/lib/api-keys.server";

export const Route = createFileRoute("/api/v1/clients")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const auth = await authenticateApiKey(request);
        if ("error" in auth) return auth.error;
        return apiJson({ error: "not_implemented", message: "GET /api/v1/clients not implemented yet." }, 501);
      },
    },
  },
});
