// HND-061: enlaces a las páginas legales y marco común de /privacidad y /terminos.
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { EncabezadoPublico } from "@/components/encabezado-publico";
import { PiePublico } from "@/components/pie-publico";
import { BORRADOR_LEGAL, fechaVersion } from "@/lib/legal";
import { cn } from "@/lib/utils";

/** Enlaces compactos al aviso de privacidad y a los términos (p. ej. al pie de /auth). */
export function EnlacesLegales({ className }: { className?: string }) {
  return (
    <nav aria-label="Legal" className={cn("flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground", className)}>
      <Link to="/privacidad" className="underline-offset-2 hover:text-foreground hover:underline">
        Aviso de privacidad
      </Link>
      <Link to="/terminos" className="underline-offset-2 hover:text-foreground hover:underline">
        Términos de uso
      </Link>
    </nav>
  );
}

/** Marco de una página legal: encabezado público, título, versión y el pie público (HND-060). */
export function PaginaLegal({
  titulo,
  version,
  children,
}: {
  titulo: string;
  version: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <EncabezadoPublico />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-3xl font-bold tracking-tight">{titulo}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Última actualización: {fechaVersion(version)}</p>
        {BORRADOR_LEGAL && (
          <p
            role="note"
            className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
          >
            Versión preliminar: este texto está pendiente de revisión legal y de publicar los datos de
            contacto del responsable.
          </p>
        )}
        <div className="mt-8 space-y-8 text-sm leading-relaxed [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_p+p]:mt-2 [&_ul]:mt-2 [&_ul]:space-y-1">
          {children}
        </div>
      </main>
      <PiePublico />
    </div>
  );
}
