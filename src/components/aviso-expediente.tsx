import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { meQuery } from "@/lib/session";
import { miNegocioQuery } from "@/lib/negocio-data";
import { ROLES_GERENCIA, tieneRol } from "@/lib/roles";

const TEXTOS = {
  sin_expediente: {
    titulo: "Registra tu negocio para empezar a cobrar",
    detalle:
      "Llena tus datos y sube 4 documentos. La red Handle los revisa y te habilita los cobros con CoDi.",
    boton: "Empezar",
  },
  borrador: {
    titulo: "Termina tu expediente",
    detalle: "Te faltan datos o documentos para enviarlo a revisión.",
    boton: "Continuar",
  },
  en_revision: {
    titulo: "Tu expediente está en revisión",
    detalle: "La red Handle lo está revisando. Te mostraremos el resultado en Mi negocio.",
    boton: "Ver estado",
  },
  rechazado: {
    titulo: "Tu expediente necesita correcciones",
    detalle: "Revisa el motivo, corrige y vuelve a enviarlo.",
    boton: "Corregir",
  },
} as const;

/** En el dashboard, le recuerda al dueño el siguiente paso de su expediente hasta que esté aprobado. */
export function AvisoExpediente() {
  const { data: me } = useQuery(meQuery);
  const esGerencia = tieneRol(me?.role, ROLES_GERENCIA);
  const { data: negocio, isPending } = useQuery({ ...miNegocioQuery, enabled: esGerencia });
  if (!esGerencia || isPending || negocio?.estado_kyb === "aprobado") return null;

  const t = TEXTOS[negocio ? negocio.estado_kyb : "sin_expediente"];
  return (
    <Card className="mb-6 flex flex-col gap-4 border-primary/30 p-5 shadow-card sm:flex-row sm:items-center">
      <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
        <Store className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{t.titulo}</p>
        <p className="text-sm text-muted-foreground">{t.detalle}</p>
      </div>
      <Button asChild>
        <Link to="/negocio">
          {t.boton} <ArrowRight />
        </Link>
      </Button>
    </Card>
  );
}
