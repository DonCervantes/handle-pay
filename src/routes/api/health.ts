import { createFileRoute } from "@tanstack/react-router";
import { respuestaSalud } from "@/lib/salud";

// HND-062 · Público y sin datos sensibles: lo usa scripts/smoke-prod.mjs tras cada deploy.
export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      // En el build de producción import.meta.env.DEV es false: demo siempre apagada.
      GET: () => respuestaSalud(process.env, import.meta.env.DEV),
    },
  },
});
