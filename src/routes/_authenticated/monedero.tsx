import { createFileRoute } from "@tanstack/react-router";
import { Gift } from "lucide-react";
import { PantallaEnConstruccion } from "@/components/pantalla-en-construccion";
import { pageMeta } from "@/lib/metadata";

export const Route = createFileRoute("/_authenticated/monedero")({
  head: () => pageMeta("Mis puntos", "Tus puntos en los negocios de la red Handle."),
  component: () => (
    <PantallaEnConstruccion
      titulo="Mis puntos"
      descripcion="Tus puntos y descuentos en los negocios de la red."
      icono={<Gift className="size-6" />}
      queVaAqui="Aquí verás cuántos puntos tienes en cada negocio, tu historial de compras y dónde usarlos."
      ticket="Fase 4 · HND-044"
    />
  ),
});
