import { createFileRoute } from "@tanstack/react-router";
import { Send } from "lucide-react";
import { PantallaEnConstruccion } from "@/components/pantalla-en-construccion";
import { pageMeta } from "@/lib/metadata";

// Los cobros CoDi viven en /caja. Esta sección es para pagar a proveedores; el flujo
// on-chain (Stellar) se retiró en HND-001 y el nuevo flujo aún no está en el backlog.
export const Route = createFileRoute("/_authenticated/pagos")({
  head: () => pageMeta("Pagos a proveedores", "Registra los pagos a tus proveedores en Handle."),
  component: () => (
    <PantallaEnConstruccion
      titulo="Pagos a proveedores"
      descripcion="Registra lo que pagas a tus proveedores."
      icono={<Send className="size-6" />}
      queVaAqui="Aquí vas a registrar y dar seguimiento a los pagos a tus proveedores. Para cobrar a tus clientes usa la Caja."
      ticket="Por definir en el backlog"
    />
  ),
});
