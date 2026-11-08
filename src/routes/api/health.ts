import { createFileRoute } from "@tanstack/react-router";
import { respuestaSalud } from "@/lib/salud";

// HND-062 · Público y sin datos sensibles: lo usa scripts/smoke-prod.mjs tras cada deploy.
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: () => respuestaSalud(process.env),
    },
  },
});
