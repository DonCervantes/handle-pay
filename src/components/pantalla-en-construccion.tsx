import type { ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";

/** Pantalla de inicio de un rol cuyo módulo aún no se construye; indica qué ticket la completa. */
export function PantallaEnConstruccion({
  titulo,
  descripcion,
  icono,
  queVaAqui,
  ticket,
}: {
  titulo: string;
  descripcion: string;
  icono: ReactNode;
  queVaAqui: string;
  ticket: string;
}) {
  return (
    <>
      <PageHeader title={titulo} description={descripcion} />
      <Card className="flex flex-col items-center gap-4 p-10 text-center shadow-card">
        <div className="grid size-12 place-items-center rounded-xl bg-muted text-muted-foreground">{icono}</div>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Estamos construyendo esta sección</h2>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">{queVaAqui}</p>
        </div>
        <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">{ticket}</span>
      </Card>
    </>
  );
}
