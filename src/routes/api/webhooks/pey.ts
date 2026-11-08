import { createFileRoute } from "@tanstack/react-router";
import { procesarWebhookPey } from "@/lib/pagos/webhook.server";

const soloPost = () =>
  new Response(JSON.stringify({ error: "método no permitido" }), {
    status: 405,
    headers: { "Content-Type": "application/json", Allow: "POST" },
  });

// Endpoint público para Pey. La autenticidad la da la firma (Standard Webhooks),
// no una sesión. Configurar en portal.mipey.mx → Desarrollador → engrane de la API key.
export const Route = createFileRoute("/api/webhooks/pey")({
  server: {
    handlers: {
      POST: ({ request }) => procesarWebhookPey(request),
      GET: soloPost,
    },
  },
});
